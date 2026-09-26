/** Branded string ids so that card ids, template ids and team ids don't mix. */
export type Brand<T, B extends string> = T & { readonly __brand: B };

/** Id of a card *definition* in the shared pool (e.g. "b1-kim-bunt"). */
export type TemplateId = Brand<string, "TemplateId">;
/** Id of a concrete owned card instance (a template bought at a certain time). */
export type CardId = Brand<string, "CardId">;
export type TeamId = Brand<string, "TeamId">;
export type ItemId = Brand<string, "ItemId">;
export type PhilosophyId = Brand<string, "PhilosophyId">;
export type BallparkId = Brand<string, "BallparkId">;

export const asTemplateId = (s: string): TemplateId => s as TemplateId;
export const asCardId = (s: string): CardId => s as CardId;
export const asTeamId = (s: string): TeamId => s as TeamId;
export const asItemId = (s: string): ItemId => s as ItemId;
export const asPhilosophyId = (s: string): PhilosophyId => s as PhilosophyId;
export const asBallparkId = (s: string): BallparkId => s as BallparkId;

/** A rating shown on a card: integer 1..99. */
export type Rating = number;
/** A probability 0..1. */
export type Probability = number;

/** Bilingual label: Korean is what the UI shows; English is for logs/docs. */
export interface Label {
  readonly ko: string;
  readonly en: string;
}
