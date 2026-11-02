import { describe, expect, it } from "vitest";
import { plainDeliveryName } from "./delivery-name";

describe("plainDeliveryName", () => {
  it("drops markdown bold markers and keeps the text", () => {
    expect(plainDeliveryName("__GLS házhozszállítás__ utánvéttel (előleg szükséges)")).toBe(
      "GLS házhozszállítás utánvéttel (előleg szükséges)"
    );
    expect(plainDeliveryName("**Foxpost** automata")).toBe("Foxpost automata");
  });

  it("leaves plain names and unpaired markers alone", () => {
    expect(plainDeliveryName("Személyes átvétel")).toBe("Személyes átvétel");
    expect(plainDeliveryName("snake__case name")).toBe("snake__case name");
  });
});
