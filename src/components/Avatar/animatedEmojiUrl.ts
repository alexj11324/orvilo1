/** Existing Fluent emoji asset protocol; pure artwork URL, no SDK executable. */
export const animatedEmojiUrl = (emoji: string) => {
  const code = [...emoji].map((character) => character.codePointAt(0)!.toString(16)).join('-');
  const main = code.split('-')[0];
  const group = main < '1f469' ? 1 : main < '1f620' ? 2 : main < '1f9a0' ? 3 : 4;
  return `https://registry.npmmirror.com/@lobehub/fluent-emoji-anim-${group}/latest/files/assets/${code}.webp`;
};
