import { z } from "zod";
import {
  ClassTagSchema,
  CostSchema,
  HandSchema,
  ItemIdSchema,
  OriginTagSchema,
  PosSchema,
  RatingSchema,
  RoleSchema,
  StarSchema,
  ThrowsSchema,
} from "./enums.js";

/** Hitter internals (§5.1). Every value is 1..99. */
export const HitterRatingsSchema = z.object({
  /** Strikeout avoidance: higher = fewer strikeouts. */
  kRate: RatingSchema,
  /** Ball-in-play hit ability vs left-handed pitchers. */
  contactL: RatingSchema,
  /** Ball-in-play hit ability vs right-handed pitchers. */
  contactR: RatingSchema,
  hrRate: RatingSchema,
  /** Extra-base-hit share (doubles and triples). */
  xbhRate: RatingSchema,
  bbRate: RatingSchema,
  /** Ground-ball tendency: higher = more grounders. Hidden. */
  gbTend: RatingSchema,
  /** Pull tendency. Hidden. */
  pullTend: RatingSchema,
  speed: RatingSchema,
  sbSkill: RatingSchema,
  /** Fielding per position; only primary/secondary positions have entries (others count as 40). */
  def: z.partialRecord(PosSchema, RatingSchema),
  arm: RatingSchema,
  /** Clutch amplitude, 0 by default (activated by synergies). Hidden. */
  clutch: z.number().int().min(0).max(99),
});
export type HitterRatings = z.infer<typeof HitterRatingsSchema>;

/** Pitcher internals (§5.1). Every value is 1..99. */
export const PitcherRatingsSchema = z.object({
  kRate: RatingSchema,
  /** Walk suppression: higher = fewer walks. */
  bbRate: RatingSchema,
  /** Home-run suppression: higher = fewer home runs. */
  hrRate: RatingSchema,
  gbRate: RatingSchema,
  contactVsL: RatingSchema,
  contactVsR: RatingSchema,
  stamina: RatingSchema,
  mental: RatingSchema,
  /** Pickoff / steal suppression. Hidden. */
  hold: RatingSchema,
  /** 0 = sidearm .. 99 = overhand. Lower widens the platoon split. Hidden. */
  armAngle: RatingSchema,
});
export type PitcherRatings = z.infer<typeof PitcherRatingsSchema>;

/** A card *definition* inside a pack (§13). */
export const CardDefSchema = z
  .object({
    id: z.string().min(1),
    name: z.string().min(1),
    nickname: z.string().min(1),
    /** Display-only club name (fictional). */
    team: z.string().min(1),
    age: z.number().int().min(17).max(45),
    bats: HandSchema,
    throws: ThrowsSchema,
    role: RoleSchema,
    pos: PosSchema,
    pos2: z.array(PosSchema),
    cost: CostSchema,
    origin: OriginTagSchema,
    classes: z.array(ClassTagSchema).min(1).max(2),
    /** ISO 3166-1 alpha-2. Present for FOREIGN cards; "KR" otherwise. */
    nationality: z.string().length(2).optional(),
    hitter: HitterRatingsSchema.optional(),
    pitcher: PitcherRatingsSchema.optional(),
  })
  .superRefine((card, ctx) => {
    if (card.role === "H") {
      if (!card.hitter) ctx.addIssue({ code: "custom", message: "hitter card needs hitter ratings", path: ["hitter"] });
      if (card.pitcher) ctx.addIssue({ code: "custom", message: "hitter card must not have pitcher ratings", path: ["pitcher"] });
    } else {
      if (!card.pitcher) ctx.addIssue({ code: "custom", message: "pitcher card needs pitcher ratings", path: ["pitcher"] });
      if (card.hitter) ctx.addIssue({ code: "custom", message: "pitcher card must not have hitter ratings", path: ["hitter"] });
    }
    if (card.cost === 5 && card.classes.length !== 2) {
      ctx.addIssue({ code: "custom", message: "5-cost cards need exactly 2 class tags", path: ["classes"] });
    }
    if (new Set(card.classes).size !== card.classes.length) {
      ctx.addIssue({ code: "custom", message: "duplicate class tag", path: ["classes"] });
    }
    if (card.pos2.includes(card.pos)) {
      ctx.addIssue({ code: "custom", message: "pos2 must not repeat pos", path: ["pos2"] });
    }
    if (card.role === "H" && card.classes.includes("CATCHER") !== (card.pos === "C")) {
      ctx.addIssue({ code: "custom", message: "CATCHER tag iff primary position is C", path: ["classes"] });
    }
    if (card.role !== "H") {
      const hitterOnly = card.classes.filter((c) => ["SLUGGER", "CONTACT_HITTER", "SPEEDSTER", "GOLD_GLOVE", "CATCHER"].includes(c));
      if (hitterOnly.length > 0) ctx.addIssue({ code: "custom", message: `pitcher has hitter-only tag ${hitterOnly.join(",")}`, path: ["classes"] });
    } else {
      const pitcherOnly = card.classes.filter((c) => ["FIREBALLER", "FINESSE", "INNING_EATER", "CLOSER"].includes(c));
      if (pitcherOnly.length > 0) ctx.addIssue({ code: "custom", message: `hitter has pitcher-only tag ${pitcherOnly.join(",")}`, path: ["classes"] });
    }
    if (card.origin === "FOREIGN" && (!card.nationality || card.nationality === "KR")) {
      ctx.addIssue({ code: "custom", message: "FOREIGN card needs a non-KR nationality", path: ["nationality"] });
    }
  });
export type CardDef = z.infer<typeof CardDefSchema>;

/** A fictional club (display only). */
export const PackTeamSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  /** Hex colour for silhouettes / jersey numbers. */
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  /** Club nickname shown on uniforms (display only), e.g. "코메츠". */
  nickname: z.string().min(1).max(12).optional(),
  /** 2–4 letter wordmark for caps, helmets and the scoreboard. */
  short: z.string().min(1).max(4).optional(),
  /** Secondary uniform colour (piping, numbers). */
  secondary: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
  /** Uniform pattern (display only). */
  uniform: z.enum(["plain", "pinstripe", "sleeve", "sash"]).optional(),
});
export type PackTeam = z.infer<typeof PackTeamSchema>;

/** A player pack: the whole league the game draws cards from (§2). */
export const PackSchema = z.object({
  /** Schema version of the pack format. */
  formatVersion: z.literal(1),
  id: z.string().regex(/^[a-z0-9][a-z0-9-]{1,40}$/),
  name: z.string().min(1),
  /** "fictional" packs may be committed; "private" packs never are. */
  kind: z.enum(["fictional", "private"]),
  generatedBy: z
    .object({
      tool: z.string(),
      version: z.string(),
      seed: z.string(),
    })
    .optional(),
  teams: z.array(PackTeamSchema).min(1),
  cards: z.array(CardDefSchema).min(1),
});
export type Pack = z.infer<typeof PackSchema>;

/** A card owned inside a run (§13). */
export const CardInstanceSchema = z.object({
  instanceId: z.string().min(1),
  defId: z.string().min(1),
  star: StarSchema,
  items: z.array(ItemIdSchema).max(3),
  /** Rounds of round-level fatigue remaining (§6.4). */
  fatigue: z.number().int().min(0),
  injuredRounds: z.number().int().min(0),
  /** Accumulated HS_PROSPECT growth in rating points. */
  growth: z.number().int().min(0),
});
export type CardInstance = z.infer<typeof CardInstanceSchema>;
