import React, { useMemo } from 'react';
import { useOptionalLayout } from '../../contexts/LayoutContext.jsx';
import { BLOCK_MAP } from '../../pages/admin/builder/blockTypes.js';
import { THEME_MAP } from '../../pages/admin/builder/themes.js';
import BlockRenderer from './BlockRenderer.jsx';
import SeasonalEffect from './SeasonalEffect.jsx';
import './themeBridge.css';

/* ----------------------------------------------------------------
   Paints a published layout on the storefront.

   `nativeSlots` is how the hand-written HomePage sections survive: the
   page passes its real JSX in, keyed by block type, and the renderer
   drops each one into position. That means a "Featured products" block
   the admin dragged to the bottom renders the genuine carousel there,
   not a copy of it.

   Anything the layout does not mention simply is not rendered, which
   is what makes hiding a section work.
   ---------------------------------------------------------------- */
const LayoutRenderer = ({
    blocks,
    isDark = false,
    products = [],
    format,
    nativeSlots = {},
}) => (
    <>
        {blocks.map((block) => (
            <BlockRenderer
                key={block.id}
                block={block}
                def={BLOCK_MAP[block.type]}
                isDark={isDark}
                products={products}
                format={format}
                nativeSlots={nativeSlots}
            />
        ))}
    </>
);

/* ----------------------------------------------------------------
   Applies the active theme's palette to <html> and runs the ambient
   effect. Kept separate from the renderer so a page can theme itself
   even while showing the built-in layout.
   ---------------------------------------------------------------- */
/* Only the ambient particles live here now. The palette itself is
   written by LayoutProvider, which sits above every route — applying
   it from a component this far down meant any page that rendered
   before it mounted kept the previous colours. */
export const ThemeSurface = ({ isDark = false }) => {
    const { activeTheme } = useOptionalLayout();

    const effect = useMemo(
        () => THEME_MAP[activeTheme]?.effect || 'none',
        [activeTheme]
    );

    return <SeasonalEffect effect={effect} isDark={isDark} />;
};

export default LayoutRenderer;
