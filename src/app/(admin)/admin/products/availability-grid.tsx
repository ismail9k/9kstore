"use client";

import type { Dispatch } from "react";

import { Checkbox } from "@/components/ui/checkbox";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { Color } from "@/lib/catalog/schema";

import type { Action, Draft } from "./form-state";

type CheckState = boolean | "indeterminate";

function combined(states: boolean[]): CheckState {
  if (states.every(Boolean)) return true;
  if (states.some(Boolean)) return "indeterminate";
  return false;
}

/**
 * Colors as rows, sizes as columns; a checked cell means in stock. Row and
 * column header boxes mark a whole color or size. Renders nothing until
 * there is at least one size and one color.
 */
export function AvailabilityGrid({
  sizes,
  colors,
  soldOut,
  dispatch,
}: {
  sizes: string[];
  colors: Color[];
  soldOut: Draft["soldOut"];
  dispatch: Dispatch<Action>;
}) {
  if (sizes.length === 0 || colors.length === 0) return null;

  const inStock = (color: string, size: string) => !soldOut.some((s) => s.color === color && s.size === size);
  const colorName = (c: Color, i: number) => c.nameEn.trim() || `Color ${i + 1}`;

  return (
    <Table className="w-auto">
      <TableHeader>
        <TableRow className="hover:bg-transparent">
          <TableHead>Color</TableHead>
          {sizes.map((size) => (
            <TableHead key={size} className="text-center">
              <div className="flex flex-col items-center gap-1.5 py-1">
                <span className="font-semibold">{size}</span>
                <Checkbox
                  aria-label={`Size ${size} in stock for every color`}
                  checked={combined(colors.map((c) => inStock(c.key, size)))}
                  onCheckedChange={(checked) =>
                    dispatch({ type: "setSizeStock", size, inStock: checked === true })
                  }
                />
              </div>
            </TableHead>
          ))}
        </TableRow>
      </TableHeader>
      <TableBody>
        {colors.map((color, i) => {
          const name = colorName(color, i);
          return (
            <TableRow key={color.key} className="hover:bg-transparent">
              <TableCell>
                <div className="flex items-center gap-2">
                  <Checkbox
                    aria-label={`${name} in stock in every size`}
                    checked={combined(sizes.map((size) => inStock(color.key, size)))}
                    onCheckedChange={(checked) =>
                      dispatch({ type: "setColorStock", color: color.key, inStock: checked === true })
                    }
                  />
                  <span
                    className="size-4 shrink-0 rounded-full border border-border"
                    style={{ backgroundColor: color.swatch }}
                    aria-hidden
                  />
                  <span>{name}</span>
                </div>
              </TableCell>
              {sizes.map((size) => (
                <TableCell key={size} className="text-center">
                  <div className="flex justify-center">
                    <Checkbox
                      aria-label={`${name}, size ${size} in stock`}
                      checked={inStock(color.key, size)}
                      onCheckedChange={(checked) =>
                        dispatch({ type: "setStock", color: color.key, size, inStock: checked === true })
                      }
                    />
                  </div>
                </TableCell>
              ))}
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}
