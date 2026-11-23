import { bundle } from '@remotion/bundler';
import { renderMedia, selectComposition } from '@remotion/renderer';
import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';

const {
  CODIGO,
  PROPS_JSON,
  SUPABASE_URL,
  SUPABASE_SECRET_KEY,
} = process.env;

const supabase = createClient(SUPABASE_URL, SUPABASE_SECRET_KEY);
const inputProps = JSON.parse(PROPS_JSON);

async function main() {
  console.log(`[${CODIGO}] Empaquetando Remotion...`);
  const bundleLocation = await bundle({
    entryPoint: path.resolve('./src/index.ts'),
  });

  const composition = await selectComposition({
    serveUrl: bundleLocation,
    id: 'ProVideo',
    inputProps,
  });

  const outFile = `/tmp/${CODIGO}_pro.mp4`;
  console.log(`[${CODIGO}] Renderizando ${composition.durationInFrames} frames...`);

  await renderMedia({
    composition,
    serveUrl: bundleLocation,
    codec: 'h264',
    outputLocation: outFile,
    inputProps,
  });

  const destPath = `${CODIGO}/editado.mp4`;
  const fileBuffer = fs.readFileSync(outFile);

  const { error: upErr } = await supabase.storage
    .from('videos-editados')
    .upload(destPath, fileBuffer, { contentType: 'video/mp4', upsert: true });

  if (upErr) throw upErr;

  const { data: pub } = supabase.storage
    .from('videos-editados')
    .getPublicUrl(destPath);

  await supabase
    .from('pedidos')
    .update({ estado: 'completado', url_video_final: pub.publicUrl })
    .eq('codigo', CODIGO);

  console.log(`[${CODIGO}] ¡Remotion Pro completado!: ${pub.publicUrl}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
