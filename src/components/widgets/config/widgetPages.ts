import { gridSpanForLayout, type PlacedWidget } from "./grid";

export type WidgetGridSpec = { cols: number; rows: number };

export const DESKTOP_WIDGET_GRID: WidgetGridSpec = { cols: 6, rows: 3 };
export const MOBILE_WIDGET_GRID: WidgetGridSpec = { cols: 2, rows: 4 };

function createOccupancy(cols: number, rows: number): boolean[][] {
  return Array.from({ length: rows }, () => Array.from({ length: cols }, () => false));
}

function canPlace(
  grid: boolean[][],
  col: number,
  row: number,
  colSpan: number,
  rowSpan: number,
  cols: number,
  rows: number,
): boolean {
  if (col + colSpan > cols || row + rowSpan > rows) return false;
  for (let r = row; r < row + rowSpan; r++) {
    for (let c = col; c < col + colSpan; c++) {
      if (grid[r][c]) return false;
    }
  }
  return true;
}

function markPlace(
  grid: boolean[][],
  col: number,
  row: number,
  colSpan: number,
  rowSpan: number,
) {
  for (let r = row; r < row + rowSpan; r++) {
    for (let c = col; c < col + colSpan; c++) {
      grid[r][c] = true;
    }
  }
}

function findPlacement(
  grid: boolean[][],
  colSpan: number,
  rowSpan: number,
  cols: number,
  rows: number,
): { col: number; row: number } | null {
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      if (canPlace(grid, col, row, colSpan, rowSpan, cols, rows)) {
        return { col, row };
      }
    }
  }
  return null;
}

/** Pack widgets into fixed-size dashboard pages (no vertical growth). */
export function paginateWidgets(
  placed: PlacedWidget[],
  spec: WidgetGridSpec,
): PlacedWidget[][] {
  const pages: PlacedWidget[][] = [];
  let current: PlacedWidget[] = [];
  let grid = createOccupancy(spec.cols, spec.rows);

  for (const widget of placed) {
    const { col: colSpan, row: rowSpan } = gridSpanForLayout(widget.size, spec);
    let placement = findPlacement(grid, colSpan, rowSpan, spec.cols, spec.rows);

    if (!placement) {
      if (current.length > 0) pages.push(current);
      current = [];
      grid = createOccupancy(spec.cols, spec.rows);
      placement = findPlacement(grid, colSpan, rowSpan, spec.cols, spec.rows);
      if (!placement) {
        pages.push([widget]);
        current = [];
        grid = createOccupancy(spec.cols, spec.rows);
        continue;
      }
    }

    markPlace(grid, placement.col, placement.row, colSpan, rowSpan);
    current.push(widget);
  }

  if (current.length > 0) pages.push(current);
  return pages.length > 0 ? pages : [[]];
}

export function pageCountForWidgets(placed: PlacedWidget[], spec: WidgetGridSpec): number {
  return paginateWidgets(placed, spec).length;
}
