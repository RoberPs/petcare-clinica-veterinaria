import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';
import { parseContent, shopSchema } from '@/content/schema';

const env = {
  CLINIC_PHONE_E164: '+34600000000',
  CLINIC_PHONE_DISPLAY: '600 00 00 00',
  CLINIC_INBOX_EMAIL: 'buzon@example.test',
  LEGAL_OWNER_NAME: 'Responsable de Pruebas',
  LEGAL_CONTACT_EMAIL: 'derechos@example.test',
};

// Ejemplo de contracts/content-file.md.
const example = () =>
  parse(`
settings:
  shipping_text: 24-48 h
  page_size: 12
  meta_description: Alimentación, higiene, juguetes y accesorios para tu mascota.
  demo_notice:
    enabled: true
    text: "Tienda de demostración: estos productos no están a la venta."
categories:
  - { slug: alimentacion, name: Alimentación }
  - { slug: higiene, name: Higiene }
pets:
  - { slug: perro, name: Perro }
  - { slug: gato, name: Gato }
  - { slug: otros, name: Otros animales }
products:
  - slug: pienso-adulto-razas-medianas
    name: Pienso adulto razas medianas 12 kg
    category: alimentacion
    pets: [perro]
    price: "39.90"
    compare_at_price: "44.90"
    vat_rate: 21
    stock: 14
    is_new: true
    image: media/petcare/productos/pienso-adulto-razas-medianas.svg
    image_alt: Saco de pienso ilustrado junto a un cuenco lleno
    short_description: Alimento completo para perros adultos de razas medianas.
    description: |
      Texto de la descripción.
    ingredients: |
      Texto de los ingredientes.
    usage: |
      Texto del modo de uso.
  - slug: champu-suave
    name: Champú suave
    category: higiene
    pets: [perro, gato]
    price: "9.90"
    vat_rate: 21
    stock: 0
    short_description: Champú de uso frecuente.
    description: Limpia sin resecar.
`) as Record<string, any>;

function issuesOf(shop: Record<string, any>) {
  const result = shopSchema.safeParse(shop);
  expect(result.success).toBe(false);
  return result.success ? [] : result.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message }));
}

const productIssue = (shop: Record<string, any>, field: string) =>
  issuesOf(shop).filter((i) => i.path.startsWith(`products.0.${field}`) || i.path === `products.${field}`);

describe('shopSchema', () => {
  it('acepta el ejemplo del contrato y aplica los valores por defecto', () => {
    const result = shopSchema.safeParse(example());
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.products[1]!.is_new).toBe(false);
    expect(result.data.products[1]!.compare_at_price ?? null).toBeNull();
    const noNotice = example();
    delete noNotice.settings.demo_notice;
    delete noNotice.settings.page_size;
    const parsed = shopSchema.parse(noNotice);
    expect(parsed.settings.page_size).toBe(12);
    expect(parsed.settings.demo_notice.enabled).toBe(false);
  });

  it('rechaza una categoría inexistente', () => {
    const shop = example();
    shop.products[0].category = 'juguetes';
    expect(productIssue(shop, 'category')[0]?.message).toContain('juguetes');
  });

  it('rechaza una mascota inexistente', () => {
    const shop = example();
    shop.products[0].pets = ['dragon'];
    expect(productIssue(shop, 'pets').some((i) => i.message.includes('dragon'))).toBe(true);
  });

  it('rechaza pets vacío o repetido', () => {
    const empty = example();
    empty.products[0].pets = [];
    expect(productIssue(empty, 'pets')).not.toHaveLength(0);
    const repeated = example();
    repeated.products[0].pets = ['perro', 'perro'];
    expect(productIssue(repeated, 'pets')).not.toHaveLength(0);
  });

  it('rechaza slugs de producto duplicados', () => {
    const shop = example();
    shop.products[1].slug = shop.products[0].slug;
    expect(issuesOf(shop).some((i) => i.path === 'products.1' && i.message.includes('repetido'))).toBe(true);
  });

  it.each(['0', '1.999', '-1', '1,50'])('rechaza price=%j', (price) => {
    const shop = example();
    shop.products[0].price = price;
    expect(productIssue(shop, 'price')).not.toHaveLength(0);
  });

  it('rechaza un precio escrito como número', () => {
    const shop = example();
    shop.products[0].price = 39.9;
    expect(productIssue(shop, 'price')).not.toHaveLength(0);
  });

  it('rechaza vat_rate=7', () => {
    const shop = example();
    shop.products[0].vat_rate = 7;
    expect(productIssue(shop, 'vat_rate')).not.toHaveLength(0);
  });

  it('rechaza stock=-1', () => {
    const shop = example();
    shop.products[0].stock = -1;
    expect(productIssue(shop, 'stock')).not.toHaveLength(0);
  });

  it('rechaza una imagen sin image_alt', () => {
    const shop = example();
    delete shop.products[0].image_alt;
    expect(productIssue(shop, 'image_alt')).not.toHaveLength(0);
  });

  it('rechaza el aviso de demostración activado sin texto', () => {
    const shop = example();
    delete shop.settings.demo_notice.text;
    expect(issuesOf(shop).some((i) => i.path.startsWith('settings.demo_notice'))).toBe(true);
  });

  it('acepta un compare_at_price menor que el precio (se ignora al mostrarlo)', () => {
    const shop = example();
    shop.products[0].compare_at_price = '10.00';
    expect(shopSchema.safeParse(shop).success).toBe(true);
  });
});

describe('bloque shop: en el archivo de contenido', () => {
  const petcare = () => parse(readFileSync('content/petcare.yaml', 'utf8')) as Record<string, any>;
  const withTienda = (content: Record<string, any>, href: string | null) => {
    content.sections = content.sections.map((s: { key: string }) => (s.key === 'tienda' ? { ...s, href } : s));
    return content;
  };

  it('falla si sections.tienda.href no es nulo y no hay bloque shop:', () => {
    const content = withTienda(petcare(), '/productos');
    delete content.shop;
    const result = parseContent(content, env);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.issues.some((i) => i.path === 'shop')).toBe(true);
  });

  it('sin tienda no exige el bloque shop:', () => {
    const content = withTienda(petcare(), null);
    delete content.shop;
    // Sin tienda tampoco hay carrito (feature 005: el carrito exige la tienda).
    content.sections.find((s: { key: string }) => s.key === 'carrito').href = null;
    expect(parseContent(content, env).ok).toBe(true);
  });

  it('indica la ruta shop.products[i].<campo> en el error', () => {
    const content = petcare();
    content.shop = example();
    content.shop.products[0].vat_rate = 7;
    const result = parseContent(content, env);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.issues.some((i) => i.path === 'shop.products[0].vat_rate')).toBe(true);
  });
});
