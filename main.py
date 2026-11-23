import os
import json
import subprocess
import tempfile
import requests
from fastapi import FastAPI, BackgroundTasks, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from supabase import create_client, Client
from groq import Groq
from openai import OpenAI

app = FastAPI(title="edita.red AI Video Worker")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

SUPABASE_URL = os.environ["SUPABASE_URL"]
SUPABASE_SECRET_KEY = os.environ["SUPABASE_SECRET_KEY"]
GROQ_API_KEY = os.environ["GROQ_API_KEY"]
OPENAI_API_KEY = os.environ["OPENAI_API_KEY"]
PIXABAY_API_KEY = os.environ["PIXABAY_API_KEY"]

supabase: Client = create_client(SUPABASE_URL, SUPABASE_SECRET_KEY)
groq_client = Groq(api_key=GROQ_API_KEY)
openai_client = OpenAI(api_key=OPENAI_API_KEY)


class ProcessRequest(BaseModel):
    codigo: str


def run_cmd(cmd: list[str]):
    res = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
    if res.returncode != 0:
        raise RuntimeError(f"FFmpeg error: {res.stderr[-500:]}")
    return res


def format_ass_time(seconds: float) -> str:
    h = int(seconds // 3600)
    m = int((seconds % 3600) // 60)
    s = int(seconds % 60)
    cs = int(round((seconds - int(seconds)) * 100))
    return f"{h}:{m:02d}:{s:02d}.{cs:02d}"


def build_ass_subtitles(words: list[dict], estilo: str, formato: str, out_path: str):
    play_res_x, play_res_y = (1080, 1920) if formato == "9:16" else (1920, 1080)

    if estilo == "viral":
        font_size = 78 if formato == "9:16" else 64
        primary_color = "&H00FFFFFF"
        highlight_color = "&H0000D7FF"
        outline_w = 5
        margin_v = 340 if formato == "9:16" else 120
    elif estilo == "limpio":
        font_size = 62 if formato == "9:16" else 52
        primary_color = "&H00F5F5F5"
        highlight_color = "&H0055FF55"
        outline_w = 3
        margin_v = 280 if formato == "9:16" else 100
    else:  # storytelling
        font_size = 58 if formato == "9:16" else 48
        primary_color = "&H00E8E8E8"
        highlight_color = "&H0080C0FF"
        outline_w = 3
        margin_v = 220 if formato == "9:16" else 90

    header = f"""[Script Info]
ScriptType: v4.00+
PlayResX: {play_res_x}
PlayResY: {play_res_y}

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Default,Montserrat,{font_size},{primary_color},&H000000FF,&H00000000,&H80000000,-1,0,0,0,100,100,0,0,1,{outline_w},2,2,60,60,{margin_v},1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
"""
    events = []
    chunk_size = 3
    for i in range(0, len(words), chunk_size):
        chunk = words[i : i + chunk_size]
        for idx, active_w in enumerate(chunk):
            start_t = active_w["start"]
            end_t = chunk[idx + 1]["start"] if idx + 1 < len(chunk) else active_w["end"]
            if end_t <= start_t:
                end_t = start_t + 0.15

            parts = []
            for j, w in enumerate(chunk):
                txt = w["word"].strip().upper() if estilo == "viral" else w["word"].strip()
                if j == idx:
                    parts.append(f"{{\\c{highlight_color}\\fscx110\\fscy110}}{txt}{{\\c{primary_color}\\fscx100\\fscy100}}")
                else:
                    parts.append(txt)
            line = " ".join(parts)
            events.append(f"Dialogue: 0,{format_ass_time(start_t)},{format_ass_time(end_t)},Default,,0,0,0,,{line}")

    with open(out_path, "w", encoding="utf-8") as f:
        f.write(header + "\n".join(events))


def fetch_broll_clip(query: str, formato: str, dest_path: str) -> bool:
    r = requests.get(
        "https://pixabay.com/api/videos/",
        params={
            "key": PIXABAY_API_KEY,
            "q": query,
            "video_type": "film",
            "per_page": 5,
            "safesearch": "true",
        },
        timeout=15,
    )
    if r.status_code != 200:
        return False

    hits = r.json().get("hits", [])
    if not hits:
        return False

    chosen = hits[0]
    for h in hits:
        v_medium = h.get("videos", {}).get("medium", {})
        w, height = v_medium.get("width", 0), v_medium.get("height", 0)
        if formato == "9:16" and height > w:
            chosen = h
            break
        if formato == "16:9" and w >= height:
            chosen = h
            break

    videos = chosen.get("videos", {})
    video_url = (videos.get("medium") or videos.get("small") or {}).get("url")
    if not video_url:
        return False

    vid_data = requests.get(video_url, timeout=30)
    with open(dest_path, "wb") as f:
        f.write(vid_data.content)
    return True


def process_video_job(codigo: str):
    try:
        res = supabase.table("pedidos").select("*").eq("codigo", codigo).single().execute()
        pedido = res.data
        if not pedido:
            return

        estilo = pedido["estilo"]
        formato = pedido["formato"]
        ruta_orig = pedido["ruta_video_original"]
        target_w, target_h = (1080, 1920) if formato == "9:16" else (1920, 1080)

        with tempfile.TemporaryDirectory() as tmp:
            raw_path = os.path.join(tmp, "raw.mp4")
            audio_path = os.path.join(tmp, "audio.mp3")
            cut_path = os.path.join(tmp, "cut.mp4")
            ass_path = os.path.join(tmp, "subs.ass")
            final_path = os.path.join(tmp, "final.mp4")

            # 1. Descargar video crudo
            file_bytes = supabase.storage.from_("videos-crudos").download(ruta_orig)
            with open(raw_path, "wb") as f:
                f.write(file_bytes)

            # 2. Reencuadre + corte de silencios
            scale_crop = f"scale={target_w}:{target_h}:force_original_aspect_ratio=increase,crop={target_w}:{target_h},fps=30"
            run_cmd([
                "ffmpeg", "-y", "-i", raw_path,
                "-vf", scale_crop,
                "-af", "silenceremove=stop_periods=-1:stop_duration=0.45:stop_threshold=-38dB",
                "-c:v", "libx264", "-preset", "veryfast", "-crf", "22",
                "-c:a", "aac", "-b:a", "128k",
                cut_path
            ])

            # 3. Transcripción palabra por palabra con Groq Whisper
            run_cmd(["ffmpeg", "-y", "-i", cut_path, "-vn", "-acodec", "libmp3lame", "-q:a", "4", audio_path])

            with open(audio_path, "rb") as af:
                transcription = groq_client.audio.transcriptions.create(
                    file=("audio.mp3", af.read()),
                    model="whisper-large-v3-turbo",
                    language="es",
                    response_format="verbose_json",
                    timestamp_granularities=["word"],
                )

            words = getattr(transcription, "words", []) or []
            full_text = getattr(transcription, "text", "")

            # 4. Guion B-Roll con GPT-4o-mini
            broll_plan = []
            if len(full_text.strip()) > 20:
                prompt_llm = (
                    f"Analiza esta transcripción en español y devuelve un JSON con una lista 'clips' "
                    f"de máximo 3 momentos donde insertar un video de apoyo (B-roll) de 2.5 segundos. "
                    f"Cada elemento debe tener: 'start' (segundo exacto de inicio, float) y 'query' (2 palabras en inglés para buscar en Pixabay). "
                    f"Transcripción: {full_text}"
                )
                chat = openai_client.chat.completions.create(
                    model="gpt-4o-mini",
                    response_format={"type": "json_object"},
                    messages=[{"role": "user", "content": prompt_llm}],
                )
                parsed = json.loads(chat.choices[0].message.content)
                broll_plan = parsed.get("clips", [])[:3]

            # 5. Superponer clips B-Roll de Pixabay
            current_video = cut_path
            for idx, item in enumerate(broll_plan):
                start_s = float(item.get("start", 0))
                query = item.get("query", "business technology")
                clip_raw = os.path.join(tmp, f"broll_raw_{idx}.mp4")
                clip_ready = os.path.join(tmp, f"broll_ready_{idx}.mp4")
                out_step = os.path.join(tmp, f"step_{idx}.mp4")

                if fetch_broll_clip(query, formato, clip_raw):
                    run_cmd([
                        "ffmpeg", "-y", "-i", clip_raw, "-t", "2.5",
                        "-vf", f"scale={target_w}:{target_h}:force_original_aspect_ratio=increase,crop={target_w}:{target_h},fps=30",
                        "-an", "-c:v", "libx264", "-preset", "veryfast",
                        clip_ready
                    ])
                    run_cmd([
                        "ffmpeg", "-y", "-i", current_video, "-itsoffset", str(start_s), "-i", clip_ready,
                        "-filter_complex", f"[0:v][1:v]overlay=0:0:enable='between(t,{start_s},{start_s + 2.5})'[v]",
                        "-map", "[v]", "-map", "0:a",
                        "-c:v", "libx264", "-preset", "veryfast", "-crf", "22", "-c:a", "copy",
                        out_step
                    ])
                    current_video = out_step

            # 6. Quemar subtítulos dinámicos
            if words:
                build_ass_subtitles(words, estilo, formato, ass_path)
                escaped_ass = ass_path.replace("\\", "/").replace(":", "\\:")
                run_cmd([
                    "ffmpeg", "-y", "-i", current_video,
                    "-vf", f"ass='{escaped_ass}'",
                    "-c:v", "libx264", "-preset", "fast", "-crf", "21",
                    "-c:a", "copy",
                    final_path
                ])
            else:
                final_path = current_video

            # 7. Subir resultado final y actualizar pedido
            dest_storage_path = f"{codigo}/editado.mp4"
            with open(final_path, "rb") as f:
                supabase.storage.from_("videos-editados").upload(
                    dest_storage_path,
                    f.read(),
                    {"content-type": "video/mp4", "upsert": "true"},
                )

            public_url = supabase.storage.from_("videos-editados").get_public_url(dest_storage_path)

            supabase.table("pedidos").update({
                "estado": "completado",
                "url_video_final": public_url,
            }).eq("codigo", codigo).execute()

    except Exception as e:
        print(f"Error procesando {codigo}: {e}")


@app.get("/health")
def health():
    return {"status": "ok"}


@app.post("/process")
def start_processing(req: ProcessRequest, background_tasks: BackgroundTasks):
    if not req.codigo:
        raise HTTPException(status_code=400, detail="Falta codigo")
    background_tasks.add_task(process_video_job, req.codigo)
    return {"status": "queued", "codigo": req.codigo}
