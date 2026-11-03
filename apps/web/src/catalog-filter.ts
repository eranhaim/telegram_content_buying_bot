export function productsInCategory<T extends { categoryIds?: string[] }>(products: T[], categoryId: string): T[] {
  return categoryId ? products.filter((product) => product.categoryIds?.includes(categoryId)) : products;
}
