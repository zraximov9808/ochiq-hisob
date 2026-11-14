/** Company name for file names: no legal form, no quotes ("ООО "NAMUNA SAVDO"" → "NAMUNA_SAVDO"). */
export function companySlug(name: string): string {
  return (
    name
      .replace(/(?<!\p{L})(ООО|OOO|МЧЖ|MCHJ|MChJ|XK|ХК|АЖ|AJ|АО|ЧП|СП|SP|QK|ҚК|YATT|ЯТТ|LLC)(?!\p{L})/giu, ' ')
      .replace(/["«»“”'`]/g, ' ')
      .trim()
      .replace(/[^\p{L}\p{N}]+/gu, '_')
      .replace(/^_+|_+$/g, '') || 'kompaniya'
  );
}
