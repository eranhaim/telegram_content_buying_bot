import assert from "node:assert/strict";
import test from "node:test";
import { productsInCategory } from "../src/catalog-filter.js";

test("filters products by category ID, with All restoring the full list", () => {
  const products = [{ id: 1, categoryIds: ["a", "b"] }, { id: 2, categoryIds: ["b"] }, { id: 3, categoryIds: [] }];
  assert.deepEqual(productsInCategory(products, "a").map((product) => product.id), [1]);
  assert.deepEqual(productsInCategory(products, "b").map((product) => product.id), [1, 2]);
  assert.deepEqual(productsInCategory(products, "missing"), []);
  assert.deepEqual(productsInCategory(products, ""), products);
});
