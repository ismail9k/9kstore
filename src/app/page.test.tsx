import { render, screen } from "@testing-library/react";
import { expect, test } from "vitest";
import Home from "./page";

test("renders the store name", () => {
  render(<Home />);
  expect(
    screen.getByRole("heading", { level: 1, name: "9k Store" }),
  ).toBeDefined();
});
