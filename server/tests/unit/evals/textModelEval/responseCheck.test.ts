import { z } from "zod";
import { classifyCall, firstJsonObject, junkIn } from "../../../../src/evals/textModelEval/responseCheck.js";

const schema = z.object({ answer: z.string() });

function reply(content: string | null, extra: { finish_reason?: string; refusal?: string } = {}) {
  return {
    status: 200,
    body: JSON.stringify({
      choices: [
        {
          finish_reason: extra.finish_reason ?? "stop",
          message: { role: "assistant", content, refusal: extra.refusal ?? null },
        },
      ],
    }),
  };
}

describe("classifyCall", () => {
  it("accepts a reply that parses and validates", () => {
    const check = classifyCall(reply('{"answer":"yes"}'), undefined, schema);
    expect(check).toMatchObject({ outcome: "valid", parsed: { answer: "yes" }, junkChars: 0 });
  });

  it("repairs text after the JSON and keeps the trailing text", () => {
    const check = classifyCall(reply('{"answer":"a } in a string"}\n\nHope this helps!'), new SyntaxError("bad"), schema);
    expect(check.outcome).toBe("repaired");
    expect(check.parsed).toEqual({ answer: "a } in a string" });
    expect(check.trailingText).toContain("Hope this helps!");
  });

  it("reports a refusal and a length cut-off before looking at the content", () => {
    expect(classifyCall(reply(null, { refusal: "I can't help." }), undefined, schema).outcome).toBe("refusal");
    expect(classifyCall(reply('{"answer":"ye', { finish_reason: "length" }), undefined, schema).outcome).toBe("length");
  });

  it("marks a 400 naming a parameter as a rejected parameter", () => {
    const check = classifyCall(
      { status: 400, body: JSON.stringify({ error: { message: "no", code: "unsupported_parameter", param: "temperature" } }) },
      new Error("400"),
      schema
    );
    expect(check).toMatchObject({ outcome: "http-error", status: 400, code: "unsupported_parameter", param: "temperature", rejectedParam: true });
    expect(classifyCall({ status: 500, body: "{}" }, new Error("500"), schema).rejectedParam).toBe(false);
  });

  it("tells a timeout from a dropped connection when no response arrived", () => {
    const timeout = new Error("Request timed out.");
    timeout.name = "TimeoutError";
    expect(classifyCall({}, timeout, schema).outcome).toBe("timeout");
    expect(classifyCall({}, new Error("socket hang up"), schema).outcome).toBe("network-error");
  });

  it("separates broken JSON from JSON that fails the schema", () => {
    expect(classifyCall(reply("not json at all"), new Error(), schema).outcome).toBe("invalid-json");
    expect(classifyCall(reply('{"answer":3}'), new Error(), schema).outcome).toBe("schema-mismatch");
  });

  it("flags junk characters inside strings", () => {
    const check = classifyCall(reply(JSON.stringify({ answer: "The café is open \u0007 今日" })), undefined, schema);
    expect(check.outcome).toBe("valid");
    expect(check.junkChars).toBe(3);
    expect(junkIn({ a: ["Ελληνικά Кириллица, émigré — 🎲"] }).count).toBe(0);
  });
});

describe("firstJsonObject", () => {
  it("returns undefined when no object closes", () => {
    expect(firstJsonObject('{"a": "b"')).toBeUndefined();
  });
});
