// Comparación de textos tal como salen de los documentos: sin mayúsculas ni
// acentos, y códigos sin guiones ni espacios.

export const normalize = (text: string) =>
  text.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim()

const codeKey = (code: string) => code.replace(/[^a-z0-9]/gi, '').toLowerCase()

export const sameCode = (a: string, b: string) => codeKey(a) === codeKey(b)
