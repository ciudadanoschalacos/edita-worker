import os
import json
import subprocess
import tempfile
import traceback
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
        print(f"FFMPEG FAILED (code {res.returncode}):\n", res.stderr[-1500:], flush=True)
        raise RuntimeError(f"FFmpeg error (code {res.returncode})")
    return res


def format_ass_time(seconds: float) -> str:
    seconds = max(0.0, seconds)
    h = int(seconds // 3600)
    m = int((seconds % 3600) // 60)
    s = int(seconds % 60)
    cs = int(round((seconds - int(seconds)) * 100))
    if cs >= 100:
        s += 1
        cs = 0
    return f"{h}:{m:02d}:{s:02d}.{cs:02d}"


def escape_ass_text(text: str) -> str:
    return text.replace("\\", "").replace("{", "(").replace("}", ")").strip()


def build_ass_graphics_and_subtitles(
    words: list[dict],
    cards: list[dict],
    estilo: str,
    formato: str,
    out_path: str,
):
    play_res_x, play_res_y = (1080, 1920) if formato == "9:16" else (1920, 1080)

    if estilo == "viral":
        font_size = 78 if formato == "9:16" else 64
        primary_color = "&H00FFFFFF"
        highlight_color = "&H0000D7FF"  # Amarillo dorado
        card_accent = "&H0000D7FF"
        card_bg = "&H30101018"
        outline_w = 5
        margin_v = 340 if formato == "9:16" else 120
    elif estilo == "limpio":
        font_size = 60 if formato == "9:16" else 50
        primary_color = "&H00F8FAFC"
        highlight_color = "&H0081B910"  # Verde esmeralda
        card_accent = "&H0081B910"
        card_bg = "&H250F172A"
        outline_w = 3
        margin_v = 280 if formato == "9:16" else 100
    else:  # storytelling
        font_size = 56 if formato == "9:16" else 46
        primary_color = "&H00F1F5F9"
        highlight_color = "&H007DD3FC"  # Azul/crema cálido
        card_accent = "&H0060A5FA"
        card_bg = "&H3518181B"
        outline_w = 3
        margin_v = 220 if formato == "9:16" else 90

    card_title_size = 44 if formato == "9:16" else 38
    card_sub_size = 30 if formato == "9:16" else 26

    header = f"""[Script Info]
ScriptType: v4.00+
PlayResX: {play_res_x}
PlayResY: {play_res_y}

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Default,Montserrat,{font_size},{primary_color},&H000000FF,&H00000000,&H80000000,-1,0,0,0,100,100,0,0,1,{outline_w},2,2,60,60,{margin_v},1
Style: CardBox,Montserrat,{card_title_size},&H00FFFFFF,&H000000FF,{card_accent},{card_bg},-1,0,0,0,100,100,1,0,3,14,0,8,70,70,220,1
Style: CardSub,Montserrat,{card_sub_size},&H00CBD5E1,&H000000FF,&H00000000,{card_bg},0,0,0,0,100,100,0,0,1,2,0,8,70,70,305,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
"""
    events = []

    # Capa 1: Tarjetas gráficas animadas tipo Remotion (Motion Graphics)
    top_y_title = 230 if formato == "9:16" else 95
    top_y_sub = 305 if formato == "9:16" else 155
    center_x = play_res_x // 2

    for card in cards:
        c_start = float(card.get("start", 1.0))
        c_end = c_start + 3.2
        title_txt = escape_ass_text(str(card.get("title", "")))
        sub_txt = escape_ass_text(str(card.get("subtitle", "")))
        if not title_txt:
            continue

        if estilo == "viral":
            title_txt = title_txt.upper()
            # Animación pop-in con rebote suave + fade out
            anim_tag = (
                f"{{\\pos({center_x},{top_y_title})\\fad(180,220)"
                f"\\fscx75\\fscy75\\t(0,180,\\fscx105\\fscy105)\\t(180,280,\\fscx100\\fscy100)}}"
            )
        else:
            # Animación slide-down elegante + fade in/out (estilo Remotion limpio)
            anim_tag = (
                f"{{\\move({center_x},{top_y_title - 35},{center_x},{top_y_title},0,260)"
                f"\\fad(220,250)}}"
            )

        events.append(
            f"Dialogue: 1,{format_ass_time(c_start)},{format_ass_time(c_end)},CardBox,,0,0,0,,{anim_tag}{title_txt}"
        )

        if sub_txt:
            sub_anim = (
                f"{{\\move({center_x},{top_y_sub - 25},{center_x},{top_y_sub},60,300)"
                f"\\fad(250,250)}}"
            )
            events.append(
                f"Dialogue: 1,{format_ass_time(c_start)},{format_ass_time(c_end)},CardSub,,0,0,0,,{sub_anim}{sub_txt}"
            )

    # Capa 0: Subtítulos dinámicos palabra por palabra
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
                raw_w = escape_ass_text(w["word"])
                txt = raw_w.upper() if estilo == "viral" else raw_w
                if j == idx:
                    scale = "112" if estilo == "viral" else "105"
                    parts.append(
                        f"{{\\c{highlight_color}\\fscx{scale}\\fscy{scale}}}{txt}{{\\c{primary_color}\\fscx100\\fscy100}}"
                    )
                else:
                    parts.append(txt)
            line = " ".join(parts)
            events.append(
                f"Dialogue: 0,{format_ass_time(start_t)},{format_ass_time(end_t)},Default,,0,0,0,,{line}"
            )

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
    video_url = (videos.get("small") or videos.get("medium") or {}).get("url")
    if not video_url:
        return False

    vid_data = requests.get(video_url, timeout=30)
    with open(dest_path, "wb") as f:
        f.write(vid_data.content)
    return True


def build_video_filter(estilo: str, target_w: int, target_h: int) -> str:
    base_scale = (
        f"scale={target_w}:{target_h}:force_original_aspect_ratio=increase,"
        f"crop={target_w}:{target_h},fps=30"
    )
    if estilo == "viral":
        # Punch-in zoom dinámico (112%) cada 3.5 segundos alternando planos
        zoom_expr = "if(lt(mod(t,7),3.5),1.0,1.12)"
        return (
            f"{base_scale},"
            f"scale=w='trunc(iw*{zoom_expr}/2)*2':h='trunc(ih*{zoom_expr}/2)*2':eval=frame,"
            f"crop={target_w}:{target_h}:(iw-{target_w})/2:(ih-{target_h})/2,"
            f"eq=contrast=1.05:saturation=1.12,format=yuv420p"
        )
    elif estilo == "limpio":
        # Zoom continuo suave (100% -> 105% en ciclo de 8s) estilo educativo moderno
        zoom_expr = "1.0+0.05*(0.5-0.5*cos(2*PI*t/8))"
        return (
            f"{base_scale},"
            f"scale=w='trunc(iw*{zoom_expr}/2)*2':h='trunc(ih*{zoom_expr}/2)*2':eval=frame,"
            f"crop={target_w}:{target_h}:(iw-{target_w})/2:(ih-{target_h})/2,"
            f"eq=contrast=1.03:brightness=0.01,format=yuv420p"
        )
    else:  # storytelling
        # Movimiento respiratorio muy sutil + tono cálido cinematográfico
        zoom_expr = "1.0+0.03*(0.5-0.5*cos(2*PI*t/10))"
        return (
            f"{base_scale},"
            f"scale=w='trunc(iw*{zoom_expr}/2)*2':h='trunc(ih*{zoom_expr}/2)*2':eval=frame,"
            f"crop={target_w}:{target_h}:(iw-{target_w})/2:(ih-{target_h})/2,"
            f"eq=contrast=1.06:saturation=0.95:gamma_r=1.03:gamma_b=0.97,format=yuv420p"
        )


def process_video_job(codigo: str):
    print(f"[{codigo}] 1. Iniciando job...", flush=True)
    try:
        res = supabase.table("pedidos").select("*").eq("codigo", codigo).single().execute()
        pedido = res.data
        if not pedido:
            print(f"[{codigo}] Pedido no encontrado en Supabase", flush=True)
            return

        estilo = pedido["estilo"]
        formato = pedido["formato"]
        ruta_orig = pedido["ruta_video_original"]
        target_w, target_h = (1080, 1920) if formato == "9:16" else (1920, 1080)
        print(f"[{codigo}] 2. Pedido leído: estilo={estilo}, formato={formato}, ruta={ruta_orig}", flush=True)

        with tempfile.TemporaryDirectory() as tmp:
            raw_path = os.path.join(tmp, "raw.mp4")
            audio_path = os.path.join(tmp, "audio.mp3")
            cut_path = os.path.join(tmp, "cut.mp4")
            ass_path = os.path.join(tmp, "subs.ass")
            final_path = os.path.join(tmp, "final.mp4")

            # 1. Descargar video crudo
            print(f"[{codigo}] 3. Descargando video crudo ({ruta_orig})...", flush=True)
            actual_path = ruta_orig
            if not actual_path or actual_path == "pendiente":
                files_in_folder = supabase.storage.from_("videos-crudos").list(codigo)
                if files_in_folder:
                    actual_path = f"{codigo}/{files_in_folder[0]['name']}"
                    print(f"[{codigo}] Ruta real encontrada en bucket: {actual_path}", flush=True)

            file_bytes = supabase.storage.from_("videos-crudos").download(actual_path)
            with open(raw_path, "wb") as f:
                f.write(file_bytes)
            print(f"[{codigo}] 4. Video descargado ({len(file_bytes)} bytes)", flush=True)

            # 2. Reencuadre + zooms dinámicos + corte de silencios
            vf_main = build_video_filter(estilo, target_w, target_h)
            try:
                run_cmd([
                    "ffmpeg", "-y", "-threads", "2", "-i", raw_path,
                    "-vf", vf_main,
                    "-af", "silenceremove=start_periods=1:start_duration=0.1:start_threshold=-40dB:stop_periods=-1:stop_duration=0.5:stop_threshold=-40dB",
                    "-c:v", "libx264", "-preset", "ultrafast", "-crf", "23", "-threads", "2",
                    "-c:a", "aac", "-b:a", "128k",
                    cut_path
                ])
            except Exception:
                print(f"[{codigo}] Fallback sin silenceremove...", flush=True)
                run_cmd([
                    "ffmpeg", "-y", "-threads", "2", "-i", raw_path,
                    "-vf", vf_main,
                    "-c:v", "libx264", "-preset", "ultrafast", "-crf", "23", "-threads", "2",
                    "-c:a", "aac", "-b:a", "128k",
                    cut_path
                ])
            print(f"[{codigo}] 5. Corte, zooms y color listo", flush=True)

            # 3. Transcripción palabra por palabra con Groq Whisper
            run_cmd(["ffmpeg", "-y", "-threads", "2", "-i", cut_path, "-vn", "-acodec", "libmp3lame", "-q:a", "4", audio_path])

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
            print(f"[{codigo}] 6. Transcripción lista ({len(words)} palabras): {full_text[:60]}...", flush=True)

            # 4. Guion de B-Roll + Tarjetas Gráficas (Motion Graphics) con GPT-4o-mini
            broll_plan = []
            cards_plan = []
            if len(full_text.strip()) > 15:
                prompt_llm = (
                    f"Eres un director de edición de video estilo '{estilo}'. Analiza esta transcripción en español "
                    f"y devuelve un JSON con exactamente dos listas:\n"
                    f"1. 'clips': máximo 3 momentos donde insertar un video de apoyo (B-roll) de 2.2 segundos. "
                    f"Cada objeto: {{'start': float, 'query': '2 palabras en inglés para Pixabay'}}.\n"
                    f"2. 'cards': máximo 3 tarjetas gráficas informativas (motion graphics) en momentos clave donde NO haya B-roll. "
                    f"Cada objeto: {{'start': float, 'title': 'título corto de max 4 palabras', 'subtitle': 'subtítulo opcional de max 6 palabras'}}.\n"
                    f"Transcripción: {full_text}"
                )
                chat = openai_client.chat.completions.create(
                    model="gpt-4o-mini",
                    response_format={"type": "json_object"},
                    messages=[{"role": "user", "content": prompt_llm}],
                )
                parsed = json.loads(chat.choices[0].message.content)
                broll_plan = parsed.get("clips", [])[:3]
                cards_plan = parsed.get("cards", [])[:3]
            print(f"[{codigo}] 7. Plan B-Roll ({len(broll_plan)}) y Cards ({len(cards_plan)}) listos", flush=True)

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
                        "ffmpeg", "-y", "-threads", "2", "-i", clip_raw, "-t", "2.2",
                        "-vf", f"scale={target_w}:{target_h}:force_original_aspect_ratio=increase,crop={target_w}:{target_h},fps=30,format=yuv420p",
                        "-an", "-c:v", "libx264", "-preset", "ultrafast", "-threads", "2",
                        clip_ready
                    ])
                    run_cmd([
                        "ffmpeg", "-y", "-threads", "2", "-i", current_video, "-itsoffset", str(start_s), "-i", clip_ready,
                        "-filter_complex", f"[0:v][1:v]overlay=0:0:enable='between(t,{start_s},{start_s + 2.2})'[v]",
                        "-map", "[v]", "-map", "0:a",
                        "-c:v", "libx264", "-preset", "ultrafast", "-crf", "23", "-threads", "2", "-c:a", "copy",
                        out_step
                    ])
                    current_video = out_step
            print(f"[{codigo}] 8. B-Roll integrado", flush=True)

            # 6. Quemar tarjetas animadas + subtítulos dinámicos
            if words or cards_plan:
                build_ass_graphics_and_subtitles(words, cards_plan, estilo, formato, ass_path)
                escaped_ass = ass_path.replace("\\", "/").replace(":", "\\:")
                run_cmd([
                    "ffmpeg", "-y", "-threads", "2", "-i", current_video,
                    "-vf", f"ass='{escaped_ass}'",
                    "-c:v", "libx264", "-preset", "ultrafast", "-crf", "22", "-threads", "2",
                    "-c:a", "copy",
                    final_path
                ])
            else:
                final_path = current_video
            print(f"[{codigo}] 9. Motion graphics y subtítulos quemados", flush=True)

            # 7. Subir resultado final y actualizar pedido
            dest_storage_path = f"{codigo}/editado.mp4"
            with open(final_path, "rb") as f:
                supabase.storage.from_("videos-editados").upload(
                    dest_storage_path,
                    f.read(),
                    {"content-type": "video/mp4", "upsert": "true"},
                )

            public_url = supabase.storage.from_("videos-editados").get_public_url(dest_storage_path)
            print(f"[{codigo}] 10. Subido a Storage: {public_url}", flush=True)

            supabase.table("pedidos").update({
                "estado": "completado",
                "url_video_final": public_url,
            }).eq("codigo", codigo).execute()
            print(f"[{codigo}] 11. ¡COMPLETADO!", flush=True)

    except Exception as e:
        print(f"[{codigo}] ERROR FATAL: {e}", flush=True)
        traceback.print_exc()


@app.get("/health")
def health():
    return {"status": "ok"}


@app.post("/process")
def start_processing(req: ProcessRequest, background_tasks: BackgroundTasks):
    if not req.codigo:
        raise HTTPException(status_code=400, detail="Falta codigo")
    background_tasks.add_task(process_video_job, req.codigo)
    return {"status": "queued", "codigo": req.codigo}
