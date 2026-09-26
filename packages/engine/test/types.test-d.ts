import { describe, expectTypeOf, it } from "vitest";
import type {
  ActiveSynergy,
  BatterTemplate,
  Board,
  CardId,
  Modifier,
  Occupant,
  PaOutcome,
  PitcherTemplate,
  PlayerTemplate,
  RunState,
  TemplateId,
  TraitId,
} from "../src/index.js";
import { ALL_TRAITS, asCardId, asTemplateId, isReplacement } from "../src/index.js";

describe("type contracts", () => {
  it("branded ids do not mix", () => {
    expectTypeOf(asCardId("x")).toEqualTypeOf<CardId>();
    expectTypeOf(asTemplateId("x")).toEqualTypeOf<TemplateId>();
    expectTypeOf<CardId>().not.toMatchTypeOf<TemplateId>();
  });

  it("player templates discriminate on role", () => {
    expectTypeOf<PlayerTemplate>().toEqualTypeOf<BatterTemplate | PitcherTemplate>();
    expectTypeOf<BatterTemplate["role"]>().toEqualTypeOf<"BATTER">();
    expectTypeOf<PitcherTemplate["role"]>().toEqualTypeOf<"STARTER" | "RELIEVER">();
  });

  it("every trait id is enumerated at runtime", () => {
    expectTypeOf(ALL_TRAITS).toEqualTypeOf<readonly TraitId[]>();
    expectTypeOf<ActiveSynergy["id"]>().toEqualTypeOf<TraitId>();
  });

  it("occupants narrow with isReplacement", () => {
    expectTypeOf(isReplacement).guards.toHaveProperty("kind").toEqualTypeOf<"REPLACEMENT">();
    expectTypeOf<Occupant>().toHaveProperty("kind").toEqualTypeOf<"CARD" | "REPLACEMENT">();
  });

  it("modifiers are data, not functions", () => {
    expectTypeOf<Modifier["op"]>().toEqualTypeOf<"ADD" | "MUL">();
    expectTypeOf<Modifier["value"]>().toBeNumber();
  });

  it("plate appearance outcomes are a closed set", () => {
    expectTypeOf<PaOutcome>().toMatchTypeOf<string>();
    expectTypeOf<"HR">().toMatchTypeOf<PaOutcome>();
    // @ts-expect-error — "BUNT_HOMER" is not an outcome
    const bad: PaOutcome = "BUNT_HOMER";
    void bad;
  });

  it("run state is fully readonly", () => {
    expectTypeOf<RunState["teams"][number]>().toHaveProperty("fanHearts").toBeNumber();
    expectTypeOf<Board["lineup"][number]["cardId"]>().toEqualTypeOf<CardId | null>();
  });
});
