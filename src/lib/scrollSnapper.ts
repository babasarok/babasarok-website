/**
 * Horizontal scroll-snap slider with synced dot indicator. Ported from the
 * old Hugo theme (`old/assets/js/scrollSnapper.ts`).
 *
 * Expects the scroll container to be styled with:
 *   display:flex; scroll-snap-type:x mandatory; scroll-behavior:smooth;
 *   overflow-x:scroll; and each child `flex-shrink:0; scroll-snap-align:center`.
 *
 * The indicator element should hold one child per slide (e.g. `<li><button>`).
 * `indexSpan` is how many items are visible at once (3 desktop / 1 mobile),
 * and must match the slide width (100 / indexSpan %).
 */
export class ScrollSnapper {
  private index = 0;
  private indexSpan = 3;
  private element: HTMLElement;
  private indicator: HTMLElement;
  private scrollTimeout: number | null = null;
  private clicked = false;

  /** Viewport width (px) below which a single item is shown at a time. */
  private readonly INDEX_SPAN_BREAKPOINT = 575;

  constructor(element: HTMLElement, indicator: HTMLElement) {
    this.element = element;
    this.indicator = indicator;
    this.initIndicator();
    this.updateIndexSpan();
    this.updateInertStatus(0);
    this.updateIndicator(0);
    this.element.style.pointerEvents = "auto";

    window.addEventListener("resize", () => {
      this.updateIndexSpan();
    });
    this.element.addEventListener("scroll", (e) => {
      this.onScroll(e);
    });

    this.element.addEventListener("pointerdown", (e) => {
      if (e.pointerType !== "mouse" && e.pointerType !== "pen") {
        return;
      }
      this.clicked = true;
      this.element.style.scrollSnapType = "none";
    });

    this.element.addEventListener("pointerup", (e) => {
      this.clicked = false;
      this.onScroll(e);
      this.element.style.scrollSnapType = "x mandatory";
    });

    this.element.addEventListener("pointercancel", (e) => {
      this.clicked = false;
      this.onScroll(e);
      this.element.style.scrollSnapType = "x mandatory";
    });

    this.element.addEventListener("pointermove", (e) => {
      if (!this.clicked) {
        return;
      }
      this.element.scrollTo({
        left: this.element.scrollLeft - e.movementX,
        behavior: "instant",
      });
    });
  }

  private updateIndexSpan(): void {
    const prev = this.indexSpan;
    this.indexSpan = window.innerWidth < this.INDEX_SPAN_BREAKPOINT ? 1 : 3;
    if (prev === this.indexSpan) {
      return;
    }
    this.updateIndicator(this.index);
    this.updateInertStatus(this.index);
  }

  private onScroll = (e: Event): void => {
    const { currentTarget } = e;
    if (!(currentTarget instanceof HTMLElement)) {
      return;
    }

    if (this.scrollTimeout) {
      clearTimeout(this.scrollTimeout);
    }
    this.scrollTimeout = globalThis.window.setTimeout(() => {
      const pageWidth = currentTarget.scrollWidth / currentTarget.children.length;
      const currentIndex = Math.round(currentTarget.scrollLeft / pageWidth);
      this.onIndexChange(currentIndex);
    }, 100);
  };

  private onIndexChange(index: number): void {
    this.index = index;
    this.updateInertStatus(index);
    this.updateIndicator(index);
  }

  private updateInertStatus(index: number): void {
    for (let i = 0; i < this.element.children.length; i++) {
      const child = this.element.children[i];
      if (!(child instanceof HTMLElement)) {
        return;
      }
      const isCurrent = i >= index && i < index + this.indexSpan;
      child.ariaHidden = isCurrent ? null : "true";
      child.inert = !isCurrent;
    }
  }

  private updateIndicator(index: number): void {
    for (let i = 0; i < this.indicator.children.length; i++) {
      const child = this.indicator.children[i];
      if (!(child instanceof HTMLElement)) {
        return;
      }
      const isCurrent = i >= index && i < index + this.indexSpan;
      child.classList.toggle("slick-active", isCurrent);
    }
  }

  private initIndicator(): void {
    for (let i = 0; i < this.indicator.children.length; i++) {
      const child = this.indicator.children[i];
      if (!(child instanceof HTMLElement)) {
        return;
      }
      child.addEventListener("click", () => {
        this.element.scrollTo({
          left: (this.element.scrollWidth / this.element.children.length) * i,
          behavior: "smooth",
        });
        this.onIndexChange(i);
      });
    }
  }
}
