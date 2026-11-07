import { describe, expect, it } from "vitest";
import { renderMarkdown } from "./renderMarkdown";

const BASE = "https://api.example/assets/";

describe("renderMarkdown", () => {
  it("rewrites host-relative asset paths to preset URLs", () => {
    const html = renderMarkdown("![alt](source/ab/file.jpg)", BASE);

    expect(html).toContain(
      'src="https://api.example/assets/source/ab/file.jpg?preset=hero-md&format=webp&q=75"'
    );
  });

  it("leaves other image sources alone", () => {
    expect(renderMarkdown("![a](https://x.test/a.png)", BASE)).toContain(
      'src="https://x.test/a.png"'
    );
  });

  it("escapes raw HTML", () => {
    const html = renderMarkdown("<script>alert(1)</script>\n\nhi <b>x</b>", BASE);

    expect(html).not.toContain("<script>");
    expect(html).not.toContain("<b>");
    expect(html).toContain("&lt;script&gt;");
  });

  it("drops javascript: links", () => {
    expect(renderMarkdown("[x](javascript:alert(1))", BASE)).not.toContain("javascript:");
  });
});
