/**
 * How much of a full-body character a framed Home surface shows.
 *
 * Home no longer draws a character, so nothing on this side crops at this
 * ratio any more; the only reader left is the artwork studio, which draws it as
 * a dashed preview frame so framing can be judged before the character lands.
 * It stays here, next to the surface it was measured against, rather than
 * moving in beside that studio — the studio is not the thing the fraction is
 * about.
 */
export const HOME_PORTRAIT_VISIBLE_RATIO = 0.65;
