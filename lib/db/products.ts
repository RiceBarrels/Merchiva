import type { Product } from "@/lib/types";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function fromDb(row: any): Product {
  return {
    id: row.id,
    name: row.name,
    category: row.category,
    price: Number(row.price),
    cost: Number(row.cost),
    unitsSoldThisMonth: Number(row.units_sold_this_month),
    unitsSoldLastMonth: Number(row.units_sold_last_month),
    revenue: Number(row.revenue),
    margin: Number(row.margin),
    rating: Number(row.rating),
    trend: row.trend,
    alert: row.alert,
    alertReason: row.alert_reason ?? undefined,
    description: row.description ?? undefined,
    images: row.images ?? undefined,
    pageTemplate: row.page_template ?? null,
  };
}

export async function getProducts(): Promise<Product[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("products")
    .select("*")
    .order("revenue", { ascending: false });
  if (error) throw error;
  return (data ?? []).map(fromDb);
}

export async function getProductById(id: string): Promise<Product | null> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("products")
    .select("*")
    .eq("id", id)
    .single();
  if (error) return null;
  return fromDb(data);
}

export async function addProduct(
  product: Omit<Product, "id">,
  userId: string
): Promise<Product> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("products")
    .insert({
      user_id: userId,
      name: product.name,
      category: product.category,
      price: product.price,
      cost: product.cost,
      units_sold_this_month: product.unitsSoldThisMonth,
      units_sold_last_month: product.unitsSoldLastMonth,
      revenue: product.revenue,
      margin: product.margin,
      rating: product.rating,
      trend: product.trend,
      alert: product.alert,
      alert_reason: product.alertReason ?? null,
      description: product.description ?? null,
      images: product.images ?? null,
      page_template: product.pageTemplate ?? null,
    })
    .select()
    .single();
  if (error) throw error;
  return fromDb(data);
}

export async function updateProduct(
  id: string,
  updates: Partial<Product>
): Promise<void> {
  const supabase = createClient();
  const payload: Record<string, unknown> = {};
  if (updates.name !== undefined) payload.name = updates.name;
  if (updates.category !== undefined) payload.category = updates.category;
  if (updates.price !== undefined) payload.price = updates.price;
  if (updates.cost !== undefined) payload.cost = updates.cost;
  if (updates.unitsSoldThisMonth !== undefined) payload.units_sold_this_month = updates.unitsSoldThisMonth;
  if (updates.unitsSoldLastMonth !== undefined) payload.units_sold_last_month = updates.unitsSoldLastMonth;
  if (updates.revenue !== undefined) payload.revenue = updates.revenue;
  if (updates.margin !== undefined) payload.margin = updates.margin;
  if (updates.rating !== undefined) payload.rating = updates.rating;
  if (updates.trend !== undefined) payload.trend = updates.trend;
  if (updates.alert !== undefined) payload.alert = updates.alert;
  if (updates.alertReason !== undefined) payload.alert_reason = updates.alertReason;
  if (updates.description !== undefined) payload.description = updates.description;
  if (updates.images !== undefined) payload.images = updates.images;
  if (updates.pageTemplate !== undefined) payload.page_template = updates.pageTemplate;
  const { error } = await supabase.from("products").update(payload).eq("id", id);
  if (error) throw error;
}

export async function deleteProduct(id: string): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase.from("products").delete().eq("id", id);
  if (error) throw error;
}
