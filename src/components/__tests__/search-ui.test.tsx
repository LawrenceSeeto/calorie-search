import { act, type ReactElement } from 'react';
import { createRoot } from 'react-dom/client';
import { Simulate } from 'react-dom/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';
import ProductCard from '../ProductCard';
import ProductGrid from '../ProductGrid';
import SearchForm from '../SearchForm';
import type { Product } from '../../types';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function makeProduct(overrides: Partial<Product> = {}): Product {
  return {
    code: '1',
    name: 'Vegemite',
    brand: 'Vegemite',
    kcalPer100g: 173,
    proteinPer100g: 25,
    fatPer100g: 1,
    carbsPer100g: 11,
    quantity: null,
    servingSize: null,
    servingGrams: null,
    countries: [],
    colesUrl: null,
    woolworthsUrl: null,
    aldiUrl: null,
    igaUrl: null,
    costcoUrl: null,
    sourceUrl: '',
    ...overrides,
  };
}

function render(element: ReactElement) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => {
    root.render(element);
  });
  return { container, root };
}

afterEach(() => {
  document.body.innerHTML = '';
});

describe('search result UI', () => {
  it('renders six skeleton cards while loading', () => {
    const { container } = render(
      <ProductGrid
        results={[]}
        total={0}
        query="milo"
        isLoading
        basketCodes={new Set()}
        onAddToBasket={vi.fn()}
      />,
    );

    expect(container.querySelectorAll('.product-skeleton')).toHaveLength(6);
    expect(container.querySelector('.spinner')).toBeNull();
  });

  it('renders image placeholders for products without images', () => {
    const { container } = render(
      <ProductCard product={makeProduct()} index={0} inBasket={false} onAdd={vi.fn()} />,
    );

    expect(container.querySelector('.product-image-placeholder')).not.toBeNull();
    expect(container.querySelector('.product-image')).toBeNull();
  });

  it('renders no retailer links when no retailer URLs are present', () => {
    const { container } = render(
      <ProductCard product={makeProduct()} index={0} inBasket={false} onAdd={vi.fn()} />,
    );

    expect(container.querySelector('.retailer-links')).toBeNull();
  });

  it('renders only available retailer links', () => {
    const { container } = render(
      <ProductCard
        product={makeProduct({
          woolworthsUrl: 'https://www.woolworths.com.au/shop/search/products?searchTerm=Vegemite',
        })}
        index={0}
        inBasket={false}
        onAdd={vi.fn()}
      />,
    );

    expect(container.querySelector('.retailer-links')).not.toBeNull();
    expect(container.querySelector('a[href*="woolworths.com.au"]')).not.toBeNull();
    expect(container.querySelector('a[href*="coles.com.au"]')).toBeNull();
  });

  it('renders both retailer links when both retailer URLs are present', () => {
    const { container } = render(
      <ProductCard
        product={makeProduct({
          colesUrl: 'https://www.coles.com.au/search?q=Vegemite',
          woolworthsUrl: 'https://www.woolworths.com.au/shop/search/products?searchTerm=Vegemite',
        })}
        index={0}
        inBasket={false}
        onAdd={vi.fn()}
      />,
    );

    expect(container.querySelector('a[href*="coles.com.au"]')).not.toBeNull();
    expect(container.querySelector('a[href*="woolworths.com.au"]')).not.toBeNull();
  });

  it('applies staggered animation delays to result cards', () => {
    const { container } = render(
      <ProductGrid
        results={[
          makeProduct({ code: '1', name: 'Tim Tams' }),
          makeProduct({ code: '2', name: 'Double choc Tim Tams' }),
        ]}
        total={2}
        query="tim tams"
        basketCodes={new Set()}
        onAddToBasket={vi.fn()}
      />,
    );

    const cards = Array.from(container.querySelectorAll<HTMLElement>('.product-card'));
    expect(cards[0]!.style.animationDelay).toBe('0ms');
    expect(cards[1]!.style.animationDelay).toBe('50ms');
  });
});

describe('SearchForm', () => {
  it('notifies on every input change and submits immediately', () => {
    const onQueryChange = vi.fn();
    const onSearch = vi.fn();
    render(
      <SearchForm onSearch={onSearch} onQueryChange={onQueryChange} disabled={false} />,
    );

    const input = document.querySelector('input[type="search"]') as HTMLInputElement;
    const form = input.closest('form')!;
    act(() => {
      input.value = 'milo';
      Simulate.change(input);
    });
    act(() => {
      Simulate.submit(form);
    });

    expect(onQueryChange).toHaveBeenCalledWith('milo');
    expect(onSearch).toHaveBeenCalledWith('milo');
  });
});
