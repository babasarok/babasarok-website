/**
 * Put css on element:
 * ```css
 * .scroll-snapper {
 *      display: flex;
     scroll-snap-type: x mandatory;
     scroll-behavior: smooth;
     overflow-x: scroll;
     scrollbar-width: none;
 * }
 * ```
 *
 * put css on every child of element:
 * ```css
 * .scroll-snapper > * {
 *      flex-shrink: 0;
 *      scroll-snap-align: center;
 *      scroll-snap-stop: always;
 *      width: 100%; // or any other width you want
 * }
 * ```
 * indicator should be in this format:
 * ```html
 * <div class="scroll-snapper-indicator">
 *      {{ range .service }}
         <li>
             <button>
             </button>
         </li>
     {{ end }}
 * </div>
 * ```
 *
 * indicator css:  See _service-section.scss for example
 *
 */

export class ScrollSnapper {
    index: number = 0;
    private element: HTMLElement;
    private indicator: HTMLElement;
    private scrollTimeout: number | null = null;

    /**
     *
     * @param element The scrollable element that contains the items to snap
     * @param indicator The element that contains the indicator for the current snap position
     */
    constructor(element: HTMLElement, indicator: HTMLElement) {
        this.element = element;
        this.indicator = indicator;
        this.initIndicator();
        this.updateInertStatus(0);
        this.updateIndicator(0);

        this.element.addEventListener("scroll", (e) => this.onScroll(e));
    }

    private onScroll = (e: Event) => {
        const { currentTarget } = e;
        if (!(currentTarget instanceof HTMLElement)) {
            return;
        }

        if (this.scrollTimeout) {
            clearTimeout(this.scrollTimeout)
        }

        this.scrollTimeout = window.setTimeout(() => {
            // update current page index
            const pageWidth = currentTarget.scrollWidth / currentTarget.children.length
            const currentIndex = Math.round(currentTarget.scrollLeft / pageWidth)
            this.onIndexChange(currentIndex)
        }, 100)
    }

    private onIndexChange(index: number) {
        this.index = index;
        this.updateInertStatus(index);
        this.updateIndicator(index);
    }

    private updateInertStatus(index: number) {
        const currentChild = this.element.children[index];
        for (let i = 0; i < this.element.children.length; i++) {
            const child = this.element.children[i];
            if (!(child instanceof HTMLElement))
                return;

            const isCurrent = child === currentChild
            child.ariaHidden = !isCurrent ? "true" : null
            child.inert = !isCurrent
        }
    }

    private updateIndicator(index: number) {
        for (let i = 0; i < this.indicator.children.length; i++) {
            const child = this.indicator.children[i];
            if (!(child instanceof HTMLElement))
                return;

            const isCurrent = i === index;
            child.classList.toggle("slick-active", isCurrent);
        };
    }

    private initIndicator() {
        for (let i = 0; i < this.indicator.children.length; i++) {
            const child = this.indicator.children[i];
            if (!(child instanceof HTMLElement))
                return;

            child.addEventListener("click", () => {
                this.element.scrollTo({
                    left: (this.element.scrollWidth / this.element.children.length) * i,
                    behavior: "smooth"
                });
                this.onIndexChange(i);
            });
        }
    }
}
