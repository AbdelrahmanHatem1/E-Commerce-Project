import React, { useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { Container, Row, Col } from 'react-bootstrap';
import axios from 'axios';
import { Link } from 'react-router-dom';
import { useCart } from '../contexts/CartContext.jsx';
import { useWishlist } from '../contexts/WishlistContext.jsx';
import { useCurrency } from '../contexts/CurrencyContext.jsx';
import { useAdmin } from '../contexts/AdminContext.jsx';
import { useOptionalLayout } from '../contexts/LayoutContext.jsx';
import { ThemeContext } from '../contexts/ThemeContext.jsx';
import LayoutRenderer, { ThemeSurface } from '../components/layout/LayoutRenderer.jsx';
import { useNotification } from '../components/Notification.jsx';
import QuickView from '../components/QuickView.jsx';
import './HomePage.css';
import StoredImage from '../components/StoredImage.jsx';

const API = 'https://dummyjson.com';

/* Each hero slide owns its copy AND its product, so the words and the
   picture can never drift apart. */
const HERO_SLIDES = [
  {
    eyebrow: 'NEW SEASON ARRIVAL',
    title: 'Experience the Future of Innovation.',
    subtitle:
      'Explore our curated selection of premium electronics designed to elevate your daily stream of life. Precision engineering meets minimalist design.',
    primary: { label: 'Shop Electronics', to: '/products' },
    secondary: { label: 'View Collections', to: '/categories' },
  },
  {
    eyebrow: 'LIMITED TIME OFFER',
    title: 'Summer Sale - Up to 50% Off',
    subtitle:
      "Don't miss out on our biggest sale of the year. Shop now and save big on selected items!",
    primary: { label: 'Shop the Sale', to: '/products?sort=discount' },
    secondary: { label: 'View Collections', to: '/categories' },
  },
  {
    eyebrow: 'NEW ARRIVALS',
    title: 'Fresh & Trendy Collections',
    subtitle: 'Explore our newest products designed just for you. Limited stock available.',
    primary: { label: 'Shop New Arrivals', to: '/products?sort=new' },
    secondary: { label: 'View Collections', to: '/categories' },
  },
];

const HERO_INTERVAL = 6000;
const FEATURED_INTERVAL = 3500;

/* Replaced by the shared currency formatter — kept as a fallback for
   the module-level helpers that run outside the component tree. */
const money = { format: (v) => `$${Number(v || 0).toFixed(2)}` };

/* The pre-discount price DummyJSON implies via discountPercentage. */
const originalPrice = (product) =>
  product.discountPercentage > 0
    ? product.price / (1 - product.discountPercentage / 100)
    : null;

/* One badge per card, highest priority first. */
const getBadge = (product) => {
  if (product.stock === 0) return { label: 'SOLD OUT', tone: 'out' };
  if (product.stock <= 5) return { label: `ONLY ${product.stock} LEFT`, tone: 'low' };
  if (product.discountPercentage >= 15)
    return { label: `-${Math.round(product.discountPercentage)}%`, tone: 'deal' };
  if (product.rating >= 4.7) return { label: 'BEST SELLER', tone: 'best' };
  if (product.rating >= 4.5) return { label: 'TOP RATED', tone: 'top' };
  return null;
};

/* ----------------------------------------------------------------
   Product card — shared by Featured, Deals and Top Rated
   ---------------------------------------------------------------- */
const ProductCard = ({
  product,
  onAddToCart,
  onQuickView,
  onOpenProduct,
  isSaved = false,
  onToggleSave,
  price,
  tabIndex = 0,
}) => {
  const badge = getBadge(product);
  const wasPrice = originalPrice(product);
  const isOutOfStock = product.stock === 0;

  return (
    <div className="product-card-styled">
      <Link
        to={`/product/${product.id}`}
        className="product-link"
        tabIndex={tabIndex}
        onClick={() => onOpenProduct?.(product)}
      >
        <div className="product-visual-placeholder">
          <StoredImage
            src={product.thumbnail}
            alt={product.title}
            className="product-image"
            loading="lazy"
          />
          {badge && <span className={`product-flag is-${badge.tone}`}>{badge.label}</span>}

          <div className="product-hover-actions">
            <button
              type="button"
              className={`product-wish ${isSaved ? 'is-saved' : ''}`}
              onClick={(event) => {
                event.preventDefault();
                event.stopPropagation();
                onToggleSave?.(product);
              }}
              aria-pressed={isSaved}
              aria-label={isSaved ? `Remove ${product.title} from wishlist` : `Save ${product.title} to wishlist`}
              title={isSaved ? 'Saved' : 'Save for later'}
              tabIndex={tabIndex}
            >
              <i className={`bi ${isSaved ? 'bi-heart-fill' : 'bi-heart'}`} aria-hidden="true" />
            </button>

            <button
              type="button"
              className="product-quick"
              onClick={(event) => {
                event.preventDefault();
                event.stopPropagation();
                onQuickView?.(product);
              }}
              aria-label={`Quick view ${product.title}`}
              title="Quick view"
              tabIndex={tabIndex}
            >
              <i className="bi bi-eye" aria-hidden="true" />
            </button>
          </div>
        </div>

        <div className="product-info-wrapper">
          <span className="product-eyebrow">{product.category.replace(/-/g, ' ')}</span>
          <h4>{product.title}</h4>

          {product.rating > 0 && (
            <p className="product-rating">
              <i className="bi bi-star-fill" aria-hidden="true" />
              {product.rating.toFixed(1)}
              {product.brand && <span className="product-brand">· {product.brand}</span>}
            </p>
          )}
        </div>
      </Link>

      <div className="product-footer-styled">
        <div className="product-price-block">
          <strong>{price(product.price)}</strong>
          {wasPrice && <span className="product-was">{price(wasPrice)}</span>}
        </div>

        <button
          type="button"
          className="btn-add-cart"
          onClick={() => onAddToCart(product)}
          disabled={isOutOfStock}
          tabIndex={tabIndex}
          aria-label={isOutOfStock ? `${product.title} is sold out` : `Add ${product.title} to cart`}
          title={isOutOfStock ? 'Sold out' : 'Add to cart'}
        >
          <i className={`bi ${isOutOfStock ? 'bi-slash-circle' : 'bi-cart-plus'}`} aria-hidden="true" />
        </button>
      </div>
    </div>
  );
};

/* ----------------------------------------------------------------
   Countdown used by the Deals of the Week section
   ---------------------------------------------------------------- */
const useCountdown = (target) => {
  const [remaining, setRemaining] = useState(() => Math.max(target - Date.now(), 0));

  useEffect(() => {
    const timer = setInterval(() => setRemaining(Math.max(target - Date.now(), 0)), 1000);
    return () => clearInterval(timer);
  }, [target]);

  const totalSeconds = Math.floor(remaining / 1000);

  return {
    days: Math.floor(totalSeconds / 86400),
    hours: Math.floor((totalSeconds % 86400) / 3600),
    minutes: Math.floor((totalSeconds % 3600) / 60),
    seconds: totalSeconds % 60,
  };
};

/* ----------------------------------------------------------------
   Skeleton shown while DummyJSON responds
   ---------------------------------------------------------------- */
const HomeSkeleton = () => (
  <div className="homepage-main" aria-busy="true" aria-label="Loading store">
    <section className="hero-section">
      <Container>
        <div className="hero-content">
          <div className="hero-text">
            <span className="skeleton skeleton-eyebrow" />
            <span className="skeleton skeleton-title" />
            <span className="skeleton skeleton-title short" />
            <span className="skeleton skeleton-text" />
            <span className="skeleton skeleton-text short" />
            <div className="skeleton-actions">
              <span className="skeleton skeleton-button" />
              <span className="skeleton skeleton-button" />
            </div>
          </div>
          <div className="hero-image">
            <span className="skeleton skeleton-hero-card" />
          </div>
        </div>
      </Container>
    </section>

    <section className="featured-products-section">
      <Container>
        <span className="skeleton skeleton-heading" />
        <div className="skeleton-grid">
          {[0, 1, 2, 3].map((index) => (
            <span className="skeleton skeleton-card" key={index} />
          ))}
        </div>
      </Container>
    </section>
  </div>
);

const HomePage = () => {
  const { applyOverrides } = useAdmin();
  const { published } = useOptionalLayout();
  const { isDarkMode } = useContext(ThemeContext);
  const [products, setProducts] = useState([]);
  const [allProducts, setAllProducts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [activeTab, setActiveTab] = useState('all');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [reloadKey, setReloadKey] = useState(0);

  const [featuredIndex, setFeaturedIndex] = useState(0);
  const [heroIndex, setHeroIndex] = useState(0);
  const [featuredItemsPerSlide, setFeaturedItemsPerSlide] = useState(4);
  const [disableFeaturedTransition, setDisableFeaturedTransition] = useState(false);
  const [isPaused, setIsPaused] = useState(false);

  const { addToCart } = useCart();
  const { isWishlisted, toggleWishlist, recentlyViewed, trackView } = useWishlist();
  const { format: price } = useCurrency();
  const { notify } = useNotification();

  const [quickViewProduct, setQuickViewProduct] = useState(null);

  const sliderRef = useRef(null);
  const touchStartRef = useRef(null);

  /* ------------------------------ data ------------------------------ */
  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();

    const fetchData = async () => {
      setLoading(true);
      setError(null);

      try {
        const { data } = await axios.get(`${API}/products?limit=100`, {
          signal: controller.signal,
        });

        if (cancelled) return;

        /* Merge the admin layer before anything is derived from the
           list — otherwise a deleted product could still headline the
           featured rail. 'store' also drops unpublished items. */
        const allProducts = applyOverrides(data.products || [], 'store');
        /* Sliced later by applyBlockPicks; keep a generous pool here. */
        setProducts(allProducts.slice(0, 24));
        setAllProducts(allProducts);

        const getCategoryProduct = (slug, preferredTitle = '') =>
          allProducts.find(
            (product) =>
              product.category === slug &&
              product.title.toLowerCase().includes(preferredTitle.toLowerCase())
          ) || allProducts.find((product) => product.category === slug);

        const imageFromProduct = (product) => product?.images?.[0] || product?.thumbnail || '';

        /* The four hand-curated tiles stay first — they are chosen for
           their photography and wording. Everything else in the store
           follows behind, so raising "Items to show" past four has more
           to show instead of silently capping. */
        const CURATED = [
          {
            name: 'Computing', slug: 'laptops',
            description: 'Work and play without limits.'
          },
          {
            name: 'Wearables', slug: 'mens-watches',
            description: 'Smart essentials for every day.'
          },
          {
            name: 'Audio', slug: 'mobile-accessories',
            description: 'Sound that moves with you.', hint: 'Echo'
          },
          {
            name: 'Home Theater', slug: 'home-decoration',
            description: 'Bring the big screen home.', hint: 'House Showpiece Plant'
          },
        ];

        const titleCase = (slug) =>
          slug.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

        const curated = CURATED.map((entry) => ({
          ...entry,
          /* An id lets the builder's product picker address these too. */
          id: entry.slug,
          image: imageFromProduct(getCategoryProduct(entry.slug, entry.hint || '')),
        }));

        const taken = new Set(CURATED.map((entry) => entry.slug));

        const extras = [...new Set(allProducts.map((product) => product.category))]
          .filter((slug) => slug && !taken.has(slug))
          .map((slug) => ({
            id: slug,
            slug,
            name: titleCase(slug),
            description: `Browse our ${titleCase(slug).toLowerCase()} range.`,
            image: imageFromProduct(getCategoryProduct(slug)),
          }));

        setCategories([...curated, ...extras]);
      } catch (err) {
        if (cancelled || axios.isCancel(err) || err.code === 'ERR_CANCELED') return;
        console.error('Failed to load the storefront:', err);
        setError('We could not load the store right now.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    fetchData();

    return () => {
      cancelled = true;
      controller.abort();
    };
    /* applyOverrides is intentionally omitted: it changes identity on
       every admin write and would refetch the whole catalogue. The
       storefront picks changes up on the next natural load. */
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reloadKey]);

  /* ------------------- cards per slide vs breakpoints ------------------- */
  useEffect(() => {
    const update = () => {
      const width = window.innerWidth;
      if (width <= 576) setFeaturedItemsPerSlide(1);
      else if (width <= 768) setFeaturedItemsPerSlide(2);
      else if (width <= 992) setFeaturedItemsPerSlide(3);
      else setFeaturedItemsPerSlide(4);
    };

    update();
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, []);

  /* ----------------------------------------------------------------
     Per-section settings coming from the published layout.

     The storefront sections used to slice a hard-coded 4 or 10, so the
     builder's "Items to show" slider and product picker had nothing to
     act on — changing them and hitting Update did nothing at all.
     This reads the settings off the block the admin configured and the
     lists below honour them.
     ---------------------------------------------------------------- */
  const blockSettings = useMemo(() => {
    const map = {};
    (published?.blocks || []).forEach((b) => {
      if (b?.type) map[b.type] = b.props || {};
    });
    return map;
  }, [published]);

  /* Applies the admin's picks/exclusions/limit to any section list.
     `fallback` keeps the original hand-tuned count when the section is
     not in a custom layout at all. */
  const applyBlockPicks = useCallback(
    (type, list, fallback) => {
      const props = blockSettings[type];
      if (!props) return list.slice(0, fallback);

      const parseIds = (text) =>
        String(text || '').split(',').map((x) => x.trim()).filter(Boolean);

      /* Explicit ids win outright and keep the admin's typed order. */
      const wanted = parseIds(props.pickIds);
      if (wanted.length) {
        const chosen = wanted
          .map((id) => list.find((p) => String(p.id) === id))
          .filter(Boolean);
        if (chosen.length) return chosen;
      }

      const skip = new Set(parseIds(props.excludeIds));
      let out = skip.size ? list.filter((p) => !skip.has(String(p.id))) : list;

      if (Number(props.minRating) > 0) {
        out = out.filter((p) => (p.rating || 0) >= Number(props.minRating));
      }
      if (props.inStockOnly) out = out.filter((p) => (p.stock ?? 1) > 0);

      const limit = Number(props.limit) > 0 ? Number(props.limit) : fallback;
      return out.slice(0, limit);
    },
    [blockSettings]
  );


  /* Featured honours the admin's picks too, then groups what survives
     into slides. Declared after applyBlockPicks because it depends on
     it — the grouping used to sit further up the file. */
  const featuredProducts = useMemo(
    () => applyBlockPicks('featured', products, 10),
    [products, applyBlockPicks]
  );

  const featuredSlides = useMemo(() => {
    const slides = [];
    for (let start = 0; start < featuredProducts.length; start += featuredItemsPerSlide) {
      slides.push(featuredProducts.slice(start, start + featuredItemsPerSlide));
    }
    return slides;
  }, [featuredProducts, featuredItemsPerSlide]);

  const featuredSlideCount = featuredSlides.length;

  /* ------------------- lists for the new sections ------------------- */
  const dealProducts = useMemo(
    () =>
      applyBlockPicks(
        'deals',
        [...allProducts]
          .filter((product) => product.discountPercentage >= 12 && product.stock > 0)
          .sort((a, b) => b.discountPercentage - a.discountPercentage),
        4
      ),
    [allProducts, applyBlockPicks]
  );

  const topRatedTabs = useMemo(() => {
    const rated = allProducts.filter((product) => product.rating >= 4.4);

    const pick = (predicate) =>
      applyBlockPicks(
        'topRated',
        rated.filter(predicate).sort((a, b) => b.rating - a.rating),
        4
      );

    return {
      all: applyBlockPicks(
        'topRated',
        [...rated].sort((a, b) => b.rating - a.rating),
        4
      ),
      tech: pick((product) =>
        ['laptops', 'smartphones', 'tablets', 'mobile-accessories'].includes(product.category)
      ),
      home: pick((product) =>
        ['furniture', 'home-decoration', 'kitchen-accessories'].includes(product.category)
      ),
      style: pick((product) =>
        ['mens-watches', 'womens-watches', 'sunglasses', 'womens-bags'].includes(product.category)
      ),
    };
  }, [allProducts, applyBlockPicks]);

  /* The deal window resets every Sunday at midnight. */
  const dealDeadline = useMemo(() => {
    const end = new Date();
    end.setDate(end.getDate() + ((7 - end.getDay()) % 7 || 7));
    end.setHours(0, 0, 0, 0);
    return end.getTime();
  }, []);

  const countdown = useCountdown(dealDeadline);

  /* The hero product is tied to the slide index, not to a runaway
     counter, so slide 2 always shows product 2. */
  const heroProduct = products.length > 0 ? products[heroIndex % products.length] : null;
  const heroSlide = HERO_SLIDES[heroIndex];

  useEffect(() => {
    if (featuredIndex >= featuredSlideCount) setFeaturedIndex(0);
  }, [featuredIndex, featuredSlideCount]);

  useEffect(() => {
    if (!disableFeaturedTransition) return undefined;
    const frame = window.requestAnimationFrame(() => setDisableFeaturedTransition(false));
    return () => window.cancelAnimationFrame(frame);
  }, [disableFeaturedTransition]);

  /* ---------------------------- featured ---------------------------- */
  const scrollFeatured = useCallback(
    (direction) => {
      if (featuredSlideCount < 2) return;

      setFeaturedIndex((current) => {
        const next = direction === 'next' ? current + 1 : current - 1;
        const looping = next < 0 || next >= featuredSlideCount;
        setDisableFeaturedTransition(looping);

        if (next >= featuredSlideCount) return 0;
        if (next < 0) return featuredSlideCount - 1;
        return next;
      });
    },
    [featuredSlideCount]
  );

  /* Autoplay pauses on hover, focus and when the tab is hidden. */
  useEffect(() => {
    if (featuredSlideCount < 2 || isPaused) return undefined;

    const timer = window.setInterval(() => scrollFeatured('next'), FEATURED_INTERVAL);
    return () => window.clearInterval(timer);
  }, [featuredSlideCount, isPaused, scrollFeatured]);

  /* ------------------------------ hero ------------------------------ */
  const scrollHero = useCallback((direction) => {
    setHeroIndex((current) =>
      direction === 'next'
        ? (current + 1) % HERO_SLIDES.length
        : (current - 1 + HERO_SLIDES.length) % HERO_SLIDES.length
    );
  }, []);

  useEffect(() => {
    if (isPaused) return undefined;
    const timer = window.setInterval(() => scrollHero('next'), HERO_INTERVAL);
    return () => window.clearInterval(timer);
  }, [isPaused, scrollHero]);

  /* Stop every timer while the tab is in the background. */
  useEffect(() => {
    const handleVisibility = () => setIsPaused(document.hidden);
    document.addEventListener('visibilitychange', handleVisibility);
    return () => document.removeEventListener('visibilitychange', handleVisibility);
  }, []);

  /* --------------------------- interactions --------------------------- */
  const handleKeyNav = (event) => {
    if (event.key === 'ArrowRight') {
      event.preventDefault();
      scrollFeatured('next');
    }
    if (event.key === 'ArrowLeft') {
      event.preventDefault();
      scrollFeatured('prev');
    }
  };

  const handleTouchStart = (event) => {
    touchStartRef.current = event.touches[0].clientX;
  };

  const handleTouchEnd = (event) => {
    if (touchStartRef.current === null) return;

    const delta = touchStartRef.current - event.changedTouches[0].clientX;
    touchStartRef.current = null;

    if (Math.abs(delta) < 50) return;
    scrollFeatured(delta > 0 ? 'next' : 'prev');
  };

  const handleAddToCart = (product) => {
    /* CartContext owns the sign-in guard and the notification. */
    addToCart(product);
  };

  /* Every grid renders the same card with the same wiring. */
  const cardProps = (product) => ({
    product,
    price,
    onAddToCart: handleAddToCart,
    onQuickView: setQuickViewProduct,
    onOpenProduct: trackView,
    isSaved: isWishlisted(product.id),
    onToggleSave: toggleWishlist,
  });

  /* Reviews are embedded in the product payload — no extra request. */
  const testimonials = useMemo(() => {
    const collected = [];

    allProducts.forEach((product) => {
      (product.reviews || []).forEach((review) => {
        if (review.rating === 5 && review.comment?.length > 8) {
          collected.push({
            id: `${product.id}-${review.reviewerName}-${review.date}`,
            name: review.reviewerName,
            comment: review.comment,
            productTitle: product.title,
            productId: product.id,
            thumbnail: product.thumbnail,
          });
        }
      });
    });

    /* Stable pseudo-shuffle so the order does not jump on re-render.

       The `.slice(0, 3)` that used to live here was the reason raising
       "Items to show" changed the builder preview but not the published
       page: the preview reads the products list directly, while the
       real section was capped at three no matter what. Three is still
       the default — it now comes from the block definition. */
    return applyBlockPicks(
      'testimonials',
      collected.filter((_, index) => index % 7 === 0),
      3
    );
  }, [allProducts, applyBlockPicks]);

  const handleNewsletter = (event) => {
    event.preventDefault();
    const email = new FormData(event.currentTarget).get('email')?.toString().trim() ?? '';

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      notify.error('Invalid email', 'Please enter a valid email address.');
      return;
    }

    event.currentTarget.reset();
    notify.success('You are on the list. Watch your inbox for early access.');
  };

  /* ----------------------------- states ----------------------------- */
  if (loading) return <HomeSkeleton />;

  if (error) {
    return (
      <div className="homepage-main">
        <div className="home-error" role="alert">
          <i className="bi bi-wifi-off" aria-hidden="true" />
          <h2>{error}</h2>
          <p>Check your connection and try again.</p>
          <button type="button" onClick={() => setReloadKey((key) => key + 1)}>
            <i className="bi bi-arrow-clockwise" aria-hidden="true" />
            Retry
          </button>
        </div>
      </div>
    );
  }

  /* ----------------------------------------------------------------
     Each hand-built section is handed to the layout system as a slot.
     When the admin has published a custom arrangement, LayoutRenderer
     decides the order and drops these in; otherwise they render in
     their original sequence below.
     ---------------------------------------------------------------- */
  const nativeSlots = {
    hero: (
      <section
        className="hero-section"
        onMouseEnter={() => setIsPaused(true)}
        onMouseLeave={() => setIsPaused(false)}
      >
        <Container>
          <div className="hero-content">
            <button
              type="button"
              onClick={() => scrollHero('prev')}
              className="slider-btn left-btn hero-desktop-prev"
              aria-label="Previous hero slide"
            >
              ←
            </button>

            <div className="hero-text">
              <p className="eyebrow fade-in" key={`eyebrow-${heroIndex}`}>
                {heroSlide.eyebrow}
              </p>
              <h1 className="hero-title slide-up" key={`title-${heroIndex}`}>
                {heroSlide.title}
              </h1>
              <p className="hero-subtitle slide-up-delayed" key={`sub-${heroIndex}`}>
                {heroSlide.subtitle}
              </p>

              <div className="hero-actions slide-up-delayed">
                <Link className="btn-primary-action" to={heroSlide.primary.to}>
                  {heroSlide.primary.label}
                </Link>
                <Link className="btn-secondary-action" to={heroSlide.secondary.to}>
                  {heroSlide.secondary.label}
                </Link>
              </div>

              <div className="slider-dots hero-slider-dots" role="tablist" aria-label="Hero slides">
                {HERO_SLIDES.map((slide, dot) => (
                  <button
                    key={slide.title}
                    type="button"
                    role="tab"
                    aria-selected={heroIndex === dot}
                    className={`dot ${heroIndex === dot ? 'active' : ''}`}
                    onClick={() => setHeroIndex(dot)}
                    aria-label={`Go to hero slide ${dot + 1}: ${slide.eyebrow}`}
                  />
                ))}
              </div>
            </div>

            <div className="hero-image">
              <button
                type="button"
                onClick={() => scrollHero('prev')}
                className="slider-btn left-btn hero-mobile-prev"
                aria-label="Previous hero slide"
              >
                ←
              </button>

              <div className="hero-product-card">
                {heroProduct && (
                  <Link to={`/product/${heroProduct.id}`} className="hero-product-link">
                    <img
                      src={heroProduct.thumbnail}
                      alt={heroProduct.title}
                      className="hero-product-image"
                      key={heroProduct.id}
                    />
                    <span className="hero-product-tag">
                      {heroProduct.title} · {price(heroProduct.price)}
                    </span>
                  </Link>
                )}
              </div>

              <button
                type="button"
                onClick={() => scrollHero('next')}
                className="slider-btn right-btn"
                aria-label="Next hero slide"
              >
                →
              </button>
            </div>
          </div>
        </Container>
      </section>
    ),

    categories: (
      <section className="top-categories-section">
        <Container>
          <div className="section-header">
            <div>
              <h2 className="section-heading">Top Categories</h2>
              <p className="section-subtitle">Curated gear for every lifestyle.</p>
            </div>
            <Link to="/categories" className="see-all-link">
              See All →
            </Link>
          </div>

          {/* The mosaic used to be four hand-written slots reading
                    categories[0..3], so "Items to show" could never change
                    anything here — it was the only section physically
                    unable to render a different count.

                    Now it renders whatever the list holds: the first tile
                    stays the tall feature, the rest flow beside it, and at
                    the default of four the arrangement is pixel-identical
                    to the original design. */}
          {(() => {
            const tiles = applyBlockPicks('categories', categories, 4);
            if (tiles.length === 0) return null;

            const [feature, ...rest] = tiles;

            const tile = (item, className) => (
              <Link
                to={`/products?category=${item?.slug || ''}`}
                className="category-link"
              >
                <div className={className}>
                  {item?.image && (
                    <img
                      className="category-photo"
                      src={item.image}
                      alt=""
                      loading="lazy"
                    />
                  )}
                  <h4>{item?.name}</h4>
                  <p>{item?.description}</p>
                </div>
              </Link>
            );

            /* One tile alone should not sit in a half-width column
               with empty space next to it. */
            if (rest.length === 0) {
              return (
                <Row className="g-4">
                  <Col md={12}>{tile(feature, 'category-card large')}</Col>
                </Row>
              );
            }

            return (
              <Row className="g-4">
                <Col md={6}>{tile(feature, 'category-card large')}</Col>

                <Col md={6}>
                  <Row className="g-4">
                    {rest.map((item, index) => {
                      /* The original shape: two small tiles side by
                         side, then a wide one underneath. Repeats
                         in threes for any longer list. */
                      const slot = index % 3;
                      const wide = slot === 2;

                      return (
                        <Col xs={wide ? 12 : 6} key={item?.slug || index}>
                          {tile(item, `category-card ${wide ? 'medium' : 'small'}`)}
                        </Col>
                      );
                    })}
                  </Row>
                </Col>
              </Row>
            );
          })()}

        </Container>
      </section>
    ),

    featured: (
      <section className="featured-products-section">
        <Container>
          <div className="section-header featured-section-header">
            <div>
              <h2 className="section-heading">Featured Products</h2>
              <p className="section-subtitle">The latest and greatest in tech innovation.</p>
            </div>

            <div className="featured-slider-controls" aria-label="Featured products controls">
              <button
                type="button"
                onClick={() => scrollFeatured('prev')}
                className="featured-slider-btn"
                aria-label="Previous featured products"
              >
                ←
              </button>
              <button
                type="button"
                onClick={() => scrollFeatured('next')}
                className="featured-slider-btn"
                aria-label="Next featured products"
              >
                →
              </button>
            </div>
          </div>

          <div
            className="featured-slider"
            ref={sliderRef}
            role="region"
            aria-roledescription="carousel"
            aria-label="Featured products"
            tabIndex={0}
            onKeyDown={handleKeyNav}
            onMouseEnter={() => setIsPaused(true)}
            onMouseLeave={() => setIsPaused(false)}
            onFocus={() => setIsPaused(true)}
            onBlur={() => setIsPaused(false)}
            onTouchStart={handleTouchStart}
            onTouchEnd={handleTouchEnd}
          >
            <div
              className={`featured-slider-inner ${disableFeaturedTransition ? 'without-transition' : ''
                }`}
              style={{ transform: `translateX(-${featuredIndex * 100}%)` }}
            >
              {featuredSlides.map((slide, slideIndex) => (
                <div
                  className="featured-slide"
                  key={`featured-slide-${slideIndex}`}
                  aria-hidden={slideIndex !== featuredIndex}
                >
                  {slide.map((product) => (
                    <div key={product.id} className="featured-product-card">
                      <ProductCard
                        {...cardProps(product)}
                        tabIndex={slideIndex === featuredIndex ? 0 : -1}
                      />
                    </div>
                  ))}
                </div>
              ))}
            </div>
          </div>

          <div className="featured-slider-dots" role="tablist" aria-label="Featured product slides">
            {featuredSlides.map((_, index) => (
              <button
                key={index}
                type="button"
                role="tab"
                aria-selected={featuredIndex === index}
                className={`dot ${featuredIndex === index ? 'active' : ''}`}
                onClick={() => {
                  setDisableFeaturedTransition(false);
                  setFeaturedIndex(index);
                }}
                aria-label={`Go to featured products slide ${index + 1}`}
              />
            ))}
          </div>
        </Container>
      </section>
    ),

    deals: (
      <section className="deals-section">
        <Container>
          <div className="deals-header">
            <div>
              <span className="deals-kicker">
                <i className="bi bi-lightning-charge-fill" aria-hidden="true" />
                Limited time
              </span>
              <h2 className="section-heading">Deals of the Week</h2>
              <p className="section-subtitle">Our deepest discounts, refreshed every Sunday.</p>
            </div>

            <div className="deals-countdown" aria-label="Time left on these deals">
              {[
                { value: countdown.days, label: 'Days' },
                { value: countdown.hours, label: 'Hrs' },
                { value: countdown.minutes, label: 'Min' },
                { value: countdown.seconds, label: 'Sec' },
              ].map((unit) => (
                <div className="countdown-unit" key={unit.label}>
                  <strong>{String(unit.value).padStart(2, '0')}</strong>
                  <span>{unit.label}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="deals-grid">
            {dealProducts.map((product) => (
              <ProductCard key={product.id} {...cardProps(product)} />
            ))}
          </div>
        </Container>
      </section>
    ),

    topRated: (
      <section className="top-rated-section">
        <Container>
          <div className="section-header">
            <div>
              <h2 className="section-heading">Top Rated by Shoppers</h2>
              <p className="section-subtitle">Only products rated 4.4 stars and above.</p>
            </div>

            <div className="rated-tabs" role="tablist" aria-label="Filter top rated products">
              {[
                { id: 'all', label: 'All' },
                { id: 'tech', label: 'Tech' },
                { id: 'home', label: 'Home' },
                { id: 'style', label: 'Style' },
              ].map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  role="tab"
                  aria-selected={activeTab === tab.id}
                  className={`rated-tab ${activeTab === tab.id ? 'is-active' : ''}`}
                  onClick={() => setActiveTab(tab.id)}
                  disabled={topRatedTabs[tab.id].length === 0}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </div>

          <div className="rated-grid">
            {topRatedTabs[activeTab].map((product) => (
              <ProductCard key={product.id} {...cardProps(product)} />
            ))}
          </div>
        </Container>
      </section>
    ),

    recent: (
      <section className="recent-section">
        <Container>
          <div className="section-header">
            <div>
              <h2 className="section-heading">Recently Viewed</h2>
              <p className="section-subtitle">Pick up right where you left off.</p>
            </div>
          </div>

          <div className="recent-strip">
            {applyBlockPicks('recent', recentlyViewed, recentlyViewed.length).map((product) => (
              <Link
                to={`/product/${product.id}`}
                className="recent-chip"
                key={product.id}
                onClick={() => trackView(product)}
              >
                <span className="recent-thumb">
                  {product.thumbnail ? (
                    <StoredImage src={product.thumbnail} alt="" loading="lazy" />
                  ) : (
                    <i className="bi bi-image" aria-hidden="true" />
                  )}
                </span>
                <span className="recent-info">
                  <span className="recent-title">{product.title}</span>
                  <span className="recent-price">{price(product.price)}</span>
                </span>
              </Link>
            ))}
          </div>
        </Container>
      </section>
    ),

    testimonials: (
      <section className="testimonials-section">
        <Container>
          <div className="testimonials-head">
            <span className="testimonials-kicker">
              <i className="bi bi-patch-check-fill" aria-hidden="true" />
              Verified reviews
            </span>
            <h2 className="section-heading">Loved by Our Shoppers</h2>
            <p className="section-subtitle">Real 5-star reviews from real ShopStream orders.</p>
          </div>

          <div className="testimonials-grid">
            {testimonials.map((review) => (
              <figure className="testimonial-card" key={review.id}>
                <span className="testimonial-stars" aria-label="5 out of 5">
                  {[1, 2, 3, 4, 5].map((star) => (
                    <i className="bi bi-star-fill" key={star} aria-hidden="true" />
                  ))}
                </span>

                <blockquote>{review.comment}</blockquote>

                <figcaption>
                  <span className="testimonial-avatar" aria-hidden="true">
                    {review.name.charAt(0)}
                  </span>
                  <span className="testimonial-person">
                    <strong>{review.name}</strong>
                    <Link to={`/product/${review.productId}`}>on {review.productTitle}</Link>
                  </span>
                </figcaption>
              </figure>
            ))}
          </div>
        </Container>
      </section>
    ),

    benefits: (
      <section className="benefits-section">
        <Container>
          <div className="benefits-grid">
            {[
              {
                icon: 'bi-truck',
                title: 'Free Express Delivery',
                copy: 'On every order, no minimum spend. Arrives in 3-5 business days.',
              },
              {
                icon: 'bi-arrow-counterclockwise',
                title: '30-Day Returns',
                copy: 'Changed your mind? Send it back within 30 days, no questions asked.',
              },
              {
                icon: 'bi-shield-check',
                title: 'Secure Payments',
                copy: '256-bit SSL encryption on every transaction, always.',
              },
              {
                icon: 'bi-headset',
                title: '24/7 Support',
                copy: 'Real people, ready to help whenever you need a hand.',
              },
            ].map((benefit) => (
              <article className="benefit-card" key={benefit.title}>
                <span className="benefit-icon" aria-hidden="true">
                  <i className={`bi ${benefit.icon}`} />
                </span>
                <h3>{benefit.title}</h3>
                <p>{benefit.copy}</p>
              </article>
            ))}
          </div>
        </Container>
      </section>
    ),

    newsletter: (
      <section className="newsletter-section">
        <Container>
          <div className="newsletter-content">
            <div className="newsletter-copy">
              <div className="newsletter-text">
                <h2>Stay Ahead of the Stream</h2>
                <p>
                  Join our inner circle for exclusive early access to product launches, seasonal
                  deals, and curated tech trends. No spam, just high-quality updates.
                </p>
              </div>

              <form className="newsletter-form" onSubmit={handleNewsletter} noValidate>
                <input
                  type="email"
                  name="email"
                  placeholder="Enter your email"
                  className="newsletter-input"
                  aria-label="Email address"
                  autoComplete="email"
                />
                <button type="submit" className="newsletter-submit">
                  Join Now
                </button>
              </form>
            </div>

            <div className="newsletter-decoration" aria-hidden="true" />
          </div>
        </Container>
      </section>
    )
  };

  const customBlocks = published?.blocks?.length ? published.blocks : null;

  return (
    <div className="homepage-main">
      {customBlocks ? (
        <LayoutRenderer
          blocks={customBlocks}
          isDark={isDarkMode}
          products={allProducts}
          format={price}
          nativeSlots={nativeSlots}
        />
      ) : (
        <>
          {nativeSlots.hero}
          {nativeSlots.categories}
          {nativeSlots.featured}
          {nativeSlots.deals}
          {nativeSlots.topRated}
          {nativeSlots.recent}
          {nativeSlots.testimonials}
          {nativeSlots.benefits}
          {nativeSlots.newsletter}
        </>
      )}

      <QuickView product={quickViewProduct} onClose={() => setQuickViewProduct(null)} />
    </div>
  );
};

export default HomePage;
