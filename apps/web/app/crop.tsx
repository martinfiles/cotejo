import type { BBox } from '@cotejo/types'
import { pageImage, pageUrl } from './page-image'

// El recorte del dato en disputa: la caja que devolvió el modelo, con un poco
// de contexto alrededor y marcada en rojo. Es CSS sobre la imagen entera de la
// página; no se genera ninguna imagen nueva.

const MAX_ZOOM = 2.2
const MARGIN_PX = 16

export async function Crop({ file, box, width = 360 }: { file: string; box: BBox; width?: number }) {
  const image = await pageImage(file)
  if (!image) return null
  const { width: W, height: H } = image

  // Cuánto se amplía: lo justo para que la caja ocupe el ancho, sin pasarse.
  const zoom = Math.min(width / ((box.w * W) + 2 * MARGIN_PX), MAX_ZOOM)
  const imgW = W * zoom
  const imgH = H * zoom
  const height = Math.max(box.h * imgH + 2 * MARGIN_PX * zoom, 56)

  // La caja centrada en el recorte.
  const left = (box.x + box.w / 2) * imgW - width / 2
  const top = (box.y + box.h / 2) * imgH - height / 2

  return (
    <div className="crop" style={{ width, height }}>
      <img src={pageUrl(file)} alt="" style={{ width: imgW, left: -left, top: -top }} />
      <div
        className="crop-mark"
        style={{ left: box.x * imgW - left, top: box.y * imgH - top, width: box.w * imgW, height: box.h * imgH }}
      />
    </div>
  )
}

// La página entera con las cajas de los datos en disputa marcadas encima.
export function DocPage({ file, boxes }: { file: string; boxes: BBox[] }) {
  return (
    <div className="page">
      <img src={pageUrl(file)} alt="" />
      {boxes.map((b, i) => (
        <div
          key={i}
          className="page-mark"
          style={{ left: `${b.x * 100}%`, top: `${b.y * 100}%`, width: `${b.w * 100}%`, height: `${b.h * 100}%` }}
        />
      ))}
    </div>
  )
}
