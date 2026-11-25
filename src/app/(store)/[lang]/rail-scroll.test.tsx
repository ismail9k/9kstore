import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { RailScroll } from "./rail-scroll";

// jsdom has no layout. Give every element a 375px phone's scroller (600px of
// content, so 0–225px of scroll) and the tees the offsets in their data
// attributes, and let scrollLeft hold what is set.
const STUBBED = ["clientWidth", "scrollWidth", "offsetLeft", "offsetWidth", "scrollLeft"] as const;
const scrollLefts = new WeakMap<HTMLElement, number>();
const scrollTo = vi.fn(function (this: HTMLElement, options: ScrollToOptions) {
  this.scrollLeft = options.left ?? 0;
});

beforeEach(() => {
  const define = (name: string, get: (el: HTMLElement) => number) =>
    Object.defineProperty(HTMLElement.prototype, name, {
      configurable: true,
      get(this: HTMLElement) {
        return get(this);
      },
    });
  define("clientWidth", () => 375);
  define("scrollWidth", () => 600);
  define("offsetLeft", (el) => Number(el.dataset.left ?? 0));
  define("offsetWidth", (el) => Number(el.dataset.width ?? 0));
  Object.defineProperty(HTMLElement.prototype, "scrollLeft", {
    configurable: true,
    get(this: HTMLElement) {
      return scrollLefts.get(this) ?? 0;
    },
    set(this: HTMLElement, value: number) {
      scrollLefts.set(this, value);
    },
  });
  HTMLElement.prototype.scrollTo = scrollTo as unknown as HTMLElement["scrollTo"];
  HTMLElement.prototype.setPointerCapture = vi.fn();
  window.matchMedia = vi.fn(() => ({ matches: false }) as MediaQueryList);
});

afterEach(() => {
  cleanup();
  for (const name of STUBBED) delete (HTMLElement.prototype as unknown as Record<string, unknown>)[name];
  scrollTo.mockClear();
});

// Four 172.5px tees, 142.5px apart: centers at 86.25, 228.75, 371.25, 513.75.
function renderRail() {
  const clicks = vi.fn((e: React.MouseEvent) => e.preventDefault());
  const { container } = render(
    <RailScroll count={4} middle={1} className="">
      <div>
        {["grey", "black", "green", "cream"].map((color, i) => (
          <a key={color} href={`#${color}`} data-tee data-left={i * 142.5} data-width={172.5} onClick={clicks}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="" alt={color} />
          </a>
        ))}
      </div>
    </RailScroll>,
  );
  return { scroller: container.firstElementChild as HTMLElement, clicks };
}

const mouse = { pointerType: "mouse", pointerId: 1, button: 0 };

describe("RailScroll", () => {
  test("opens with the middle tee centered", () => {
    const { scroller } = renderRail();
    expect(scroller.scrollLeft).toBe(41.25);
  });

  test("a plain click still reaches the tee", () => {
    const { scroller, clicks } = renderRail();
    fireEvent.pointerDown(scroller, { ...mouse, clientX: 100 });
    fireEvent.pointerMove(scroller, { ...mouse, clientX: 103 });
    fireEvent.pointerUp(scroller, { ...mouse, clientX: 103 });
    fireEvent.click(screen.getByAltText("black"));
    expect(clicks).toHaveBeenCalledTimes(1);
    expect(scroller.scrollLeft).toBe(41.25);
  });

  test("a mouse drag scrolls, snaps to the nearest tee and swallows the click", () => {
    const { scroller, clicks } = renderRail();
    fireEvent.pointerDown(scroller, { ...mouse, clientX: 200 });
    fireEvent.pointerMove(scroller, { ...mouse, clientX: 100 });
    expect(scroller.scrollLeft).toBe(141.25);
    fireEvent.pointerUp(scroller, { ...mouse, clientX: 100 });
    expect(scrollTo).toHaveBeenLastCalledWith({ left: 183.75, behavior: "smooth" });
    fireEvent.click(screen.getByAltText("black"));
    expect(clicks).not.toHaveBeenCalled();

    // The next plain click goes through again.
    fireEvent.pointerDown(scroller, { ...mouse, clientX: 100 });
    fireEvent.pointerUp(scroller, { ...mouse, clientX: 100 });
    fireEvent.click(screen.getByAltText("green"));
    expect(clicks).toHaveBeenCalledTimes(1);
  });

  test("a drag can reach either end", () => {
    const { scroller } = renderRail();
    fireEvent.pointerDown(scroller, { ...mouse, clientX: 100 });
    fireEvent.pointerMove(scroller, { ...mouse, clientX: 130 });
    fireEvent.pointerUp(scroller, { ...mouse, clientX: 130 });
    expect(scrollTo).toHaveBeenLastCalledWith({ left: 0, behavior: "smooth" });
  });

  test("touch is left to the browser's own scrolling", () => {
    const { scroller } = renderRail();
    const touch = { pointerType: "touch", pointerId: 2, button: 0 };
    fireEvent.pointerDown(scroller, { ...touch, clientX: 200 });
    fireEvent.pointerMove(scroller, { ...touch, clientX: 100 });
    fireEvent.pointerUp(scroller, { ...touch, clientX: 100 });
    expect(scroller.scrollLeft).toBe(41.25);
    expect(scrollTo).not.toHaveBeenCalled();
  });

  test("the browser's native image drag is off", () => {
    renderRail();
    expect(fireEvent.dragStart(screen.getByAltText("grey"))).toBe(false);
  });
});
