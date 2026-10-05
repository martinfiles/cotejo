import { pageImage } from '../page-image'

export async function GET(request: Request) {
  const file = new URL(request.url).searchParams.get('f') ?? ''
  const image = await pageImage(file)
  if (!image) return new Response('No encontrado', { status: 404 })
  return new Response(new Uint8Array(image.data), { headers: { 'content-type': image.mediaType, 'cache-control': 'max-age=3600' } })
}
