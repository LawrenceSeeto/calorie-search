import { useEffect, useState } from 'react';
import { Plus, Check } from 'lucide-react';
import type { Product } from '../types';

interface Props {
  product: Product;
  index: number;
  inBasket: boolean;
  onAdd: (product: Product) => void;
}

function calClass(kcal: number): string {
  if (kcal < 100) return 'cal-low';
  if (kcal < 300) return 'cal-medium';
  return 'cal-high';
}

function isBarcode(code: string): boolean {
  return /^\d{8,14}$/.test(code);
}

export default function ProductCard({ product, index, inBasket, onAdd }: Props) {
  const [srcIndex, setSrcIndex] = useState(0);
  const [imageLoaded, setImageLoaded] = useState(false);
  const sources = [
    isBarcode(product.code)
      ? `https://cdn0.woolworths.media/content/wowproductimages/large/${product.code}.jpg`
      : null,
  ].filter((source): source is string => source !== null && source.length > 0);
  const currentSrc = sources[srcIndex];
  const showImage = currentSrc !== undefined;
  const imageSlotClassName = [
    'product-image-slot',
    showImage && !imageLoaded ? 'product-image-loading' : '',
    showImage ? '' : 'product-image-placeholder',
  ]
    .filter(Boolean)
    .join(' ');

  useEffect(() => {
    setSrcIndex(0);
    setImageLoaded(false);
  }, [product.code]);

  return (
    <li
      className="product-row product-card"
      style={{ animationDelay: `${Math.min(index * 50, 300)}ms` }}
    >
      <div
        className={imageSlotClassName}
        aria-hidden="true"
      >
        {showImage ? (
          <img
            className="product-image"
            src={currentSrc}
            alt=""
            loading="lazy"
            onLoad={() => {
              console.log(
                `[img] loaded from ${
                  currentSrc?.includes('woolworths') ? 'Woolworths CDN' : 'OFN'
                }: ${currentSrc}`,
              );
              setImageLoaded(true);
            }}
            onError={() => {
              setImageLoaded(false);
              setSrcIndex(i => i + 1);
            }}
          />
        ) : (
          <svg className="product-placeholder-icon" viewBox="0 0 24 24" role="img">
            <path
              d="M7 3v7M4.5 3v7M9.5 3v7M4.5 10h5M7 10v11M16 3c2.2 1.6 3.5 4.2 3.5 7.1 0 2.3-.8 4.4-2.1 5.9V21H15v-5c-1.3-1.5-2-3.6-2-5.9C13 7.2 14.1 4.6 16 3Z"
              fill="none"
              stroke="currentColor"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="1.8"
            />
          </svg>
        )}
      </div>
      <div className="product-info">
        <span className="product-name">{product.name}</span>
        {product.brand && <span className="product-brand">{product.brand}</span>}
      </div>
      {(product.colesUrl || product.woolworthsUrl || product.aldiUrl || product.igaUrl || product.costcoUrl) && (
        <div className="retailer-links">
          {product.woolworthsUrl && (
            <a className="retailer-link" href={product.woolworthsUrl} target="_blank" rel="noopener noreferrer">
              Woolworths ↗
            </a>
          )}
          {product.colesUrl && (
            <a className="retailer-link" href={product.colesUrl} target="_blank" rel="noopener noreferrer">
              Coles ↗
            </a>
          )}
          {product.aldiUrl && (
            <a className="retailer-link" href={product.aldiUrl} target="_blank" rel="noopener noreferrer">
              ALDI ↗
            </a>
          )}
          {product.igaUrl && (
            <a className="retailer-link" href={product.igaUrl} target="_blank" rel="noopener noreferrer">
              IGA ↗
            </a>
          )}
          {product.costcoUrl && (
            <a className="retailer-link" href={product.costcoUrl} target="_blank" rel="noopener noreferrer">
              Costco ↗
            </a>
          )}
        </div>
      )}
      <div className="macro-pills">
        <span className={`macro-pill ${calClass(product.kcalPer100g)}`}>
          {product.kcalPer100g} kcal
        </span>
        {product.proteinPer100g !== null && (
          <span className="macro-pill macro-protein">{product.proteinPer100g}g protein</span>
        )}
        {product.fatPer100g !== null && (
          <span className="macro-pill macro-fat">{product.fatPer100g}g fat</span>
        )}
        {product.carbsPer100g !== null && (
          <span className="macro-pill macro-carbs">{product.carbsPer100g}g carbs</span>
        )}
      </div>
      <button
        type="button"
        className={`add-btn${inBasket ? ' add-btn-in-basket' : ''}`}
        onClick={() => { if (!inBasket) onAdd(product); }}
        aria-label={inBasket ? `${product.name} is in your basket` : `Add ${product.name} to basket`}
        aria-pressed={inBasket}
      >
        {inBasket ? <Check size={14} /> : <Plus size={14} />}
        <span>{inBasket ? 'In Basket' : 'Add'}</span>
      </button>
    </li>
  );
}
