import _default from "../locale/index.js";
//#region src/types/locale.d.ts
/**
 * Internationalization key type declaration, plugins can extend through declaration merging
 */
type LocaleType = typeof _default;
type FlattenKeys<T, Prefix extends string = ''> = { [K in keyof T & string]: T[K] extends string ? Prefix extends '' ? K : `${Prefix}.${K}` : T[K] extends Record<string, any> ? FlattenKeys<T[K], Prefix extends '' ? K : `${Prefix}.${K}`> : never; }[keyof T & string];
type ILocaleKeys = Record<FlattenKeys<LocaleType>, string>;
//#endregion
export { ILocaleKeys, LocaleType };