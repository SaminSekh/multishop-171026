(function () {
    'use strict';

    var CATEGORIES = [
        { slug: 'electronics', name: 'Electronics', icon: 'i-bolt' },
        { slug: 'fashion', name: 'Fashion', icon: 'i-tag' },
        { slug: 'footwear', name: 'Footwear', icon: 'i-grid' },
        { slug: 'home-kitchen', name: 'Home & Kitchen', icon: 'i-home' },
        { slug: 'beauty', name: 'Beauty', icon: 'i-heart' },
        { slug: 'sports', name: 'Sports', icon: 'i-bolt' },
        { slug: 'books', name: 'Books', icon: 'i-info' },
        { slug: 'accessories', name: 'Accessories', icon: 'i-package' }
    ];

    var FABRIC = {
        Fashion: 'Premium combed cotton',
        Footwear: 'Premium leather',
        'Home & Kitchen': 'Food-grade materials',
        Beauty: 'Dermatologist tested',
        Sports: 'Breathable performance mesh',
        Accessories: 'Full-grain leather',
        Books: 'Acid-free paper',
        Electronics: 'ABS + aluminium build'
    };

    var SIZE_SETS = {
        Fashion: ['XS', 'S', 'M', 'L', 'XL'],
        Footwear: ['UK 6', 'UK 7', 'UK 8', 'UK 9', 'UK 10', 'UK 11']
    };

    var RAW = [];

    var PHOTO_BASE = 'https://images.unsplash.com/photo-';

    var PHOTO_POOL = {
        electronics: [
            '1505740420928-5e560c06d30e', '1546435770-a3e426bf472b',
            '1527864550417-7fd91fc51a46', '1484704849700-f032a568e944',
            '1583394838336-acd977736f90', '1523206489230-c012c64b2b48',
            '1606107557195-0e29a4b5b4aa', '1590658268037-6bf12165a8df',
            '1496181133206-80ce9b88a853', '1517336714731-489689fd1ca8',
            '1498049794561-7780e7231661', '1593642532400-2682810df593',
            '1519389950473-47ba0277781c', '1524805444758-089113d48a6d',
            '1587829741301-dc798b83add3', '1541140532154-b024d705b90a',
            '1511707171634-5f897ff02aa9', '1592750475338-74b7b21085ab',
            '1585060544812-6b45742d762f', '1512499617640-c74ae3a79d37',
            '1526170375885-4d8ecf77b99f', '1502920917128-1aa500764cbd',
            '1516035069371-29a1b244cc32'
        ],
        fashion: [
            '1576566588028-4147f3842f27', '1551107696-a4b0c5a0d9a2',
            '1521572163474-6864f9cf17ab', '1434389677669-e08b4cac3105',
            '1542272604-787c3835535d', '1541099649105-f69ad21f3246',
            '1483721310020-03333e577078', '1481277542470-605612bd2d61',
            '1494438639946-1ebd1d20bf85', '1503602642458-232111445657',
            '1517705008128-361805f42e86', '1519315901367-f34ff9154487',
            '1509228468518-180dd4864904', '1567016432779-094069958ea5',
            '1576678927484-cc907957088c', '1571945153237-4929e783af4a'
        ],
        footwear: [
            '1542291026-7eec264c27ff', '1549298916-b41d501d3772',
            '1595950653106-6c9ebd614d3a', '1560769629-975ec94e6a86',
            '1571781926291-c477ebfd024b', '1491553895911-0055eca6402d',
            '1600185365483-26d7a4cc7519', '1607082348824-0a96f2a4b9da',
            '1441986300917-64674bd600d8', '1607083206869-4c7672e72a8a',
            '1556906781-9a412961c28c'
        ],
        'home-kitchen': [
            '1507473885765-e6ed057f782c', '1516961642265-531546e84af2',
            '1540932239986-30128078f3c5', '1471295253337-3ceaaedca402',
            '1460353581641-37baddab0fa2', '1517705008128-361805f42e86',
            '1533105079780-92b9be482077', '1585386959984-a4155224a1ad',
            '1549576490-b0b4831ef60a', '1560472354-b33ff0c44a43',
            '1519315901367-f34ff9154487'
        ],
        beauty: [
            '1620916566398-39f1143ab7be', '1582418702059-97ebafb35d09',
            '1571945153237-4929e783af4a', '1560472354-b33ff0c44a43',
            '1494438639946-1ebd1d20bf85', '1481277542470-605612bd2d61',
            '1567016432779-094069958ea5', '1576678927484-cc907957088c'
        ],
        sports: [
            '1517836357463-d25dfeac3438', '1534438327276-14e5300c3a48',
            '1571019613454-1cb2f99b2d8b', '1516961642265-531546e84af2',
            '1503602642458-232111445657', '1460353581641-37baddab0fa2',
            '1471295253337-3ceaaedca402', '1509228468518-180dd4864904',
            '1519315901367-f34ff9154487'
        ],
        books: [
            '1594223274512-ad4803739b7c', '1544716278-ca5e3f4abd8c',
            '1512820790803-83ca734da794', '1481627834876-b7833e8f5570',
            '1524995997946-a1c2e315a42f', '1532012197267-da84d127e765',
            '1585386959984-a4155224a1ad', '1549576490-b0b4831ef60a'
        ],
        accessories: [
            '1572635196237-14b3f281503f', '1511499767150-a48a237f0083',
            '1553062407-98eeb64c6a62', '1622560480605-d83c853bc5c3',
            '1548036328-c9fa89d128fa', '1553545204-4f7d339aa06a',
            '1590874103328-eac38a683ce7', '1523275335684-37898b6baf30',
            '1541643600914-78b084683601', '1572569511254-d8f925fe2cbb',
            '1546868871-7041f2a55e12'
        ]
    };

    function slugify(str) {
        return String(str).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    }

    function photoUrl(id) {
        return PHOTO_BASE + id + '?auto=format&fit=crop&crop=entropy&w=900&h=900&q=70';
    }

    function buildImages(slug, seed) {
        var pool = PHOTO_POOL[slug] || PHOTO_POOL.electronics;
        var start = (seed * 5) % pool.length;
        var out = [];
        for (var i = 0; i < 3; i++) out.push(photoUrl(pool[(start + i * 7) % pool.length]));
        return out;
    }

    function variantImage(slug, seed, index, total) {
        var pool = PHOTO_POOL[slug] || PHOTO_POOL.electronics;
        var spread = Math.max(1, Math.floor(pool.length / Math.max(1, total)));
        var start = (seed * 5) % pool.length;
        return photoUrl(pool[(start + index * spread) % pool.length]);
    }

    function buildRatingBreakdown(rating, total) {
        var center = Math.max(1, Math.min(5, rating));
        var sigma = 0.85;
        var rows = [];
        var stars;
        for (stars = 1; stars <= 5; stars++) {
            var z = (stars - center) / sigma;
            rows.push({ stars: stars, count: Math.round(total * Math.exp(-(z * z) / 2)), pct: 0 });
        }
        var diff = total - rows.reduce(function (a, b) { return a + b.count; }, 0);
        rows[0].count += diff;
        var sum = rows.reduce(function (a, b) { return a + b.count; }, 0) || 1;
        rows.forEach(function (row) {
            row.pct = Math.round(row.count / sum * 100);
        });
        return rows.reverse();
    }

    function buildSpecs(category, brand, name, sku) {
        var model = sku || (slugify(name).split('-').slice(0, 3).join('-')).toUpperCase();
        var common = [
            ['Brand', brand],
            ['Model code', model],
            ['Country of origin', 'India']
        ];
        if (category === 'Fashion' || category === 'Footwear') {
            return [
                ['Brand', brand],
                ['Material', FABRIC[category]],
                ['Care', category === 'Footwear' ? 'Wipe with a dry cloth' : 'Machine wash cold, do not bleach'],
                ['Fit', category === 'Footwear' ? 'True to size' : 'Regular fit'],
                ['Manufacturer', brand + ' Retail Pvt Ltd']
            ];
        }
        return common;
    }

    function clamp(value, min, max) {
        return Math.max(min, Math.min(max, value));
    }

    function splitList(value) {
        if (Array.isArray(value)) {
            return value.map(function (v) { return String(v == null ? '' : v).trim(); }).filter(Boolean);
        }
        return String(value == null ? '' : value)
            .split(/[\n,]/)
            .map(function (v) { return v.trim(); })
            .filter(Boolean);
    }

    function sanitizeColor(color) {
        var name, hex, image, sizes, stock, sizeStock;
        if (Array.isArray(color)) {
            name = color[0];
            hex = color[1];
            image = color[2];
            sizes = color[3];
            stock = color[4];
            sizeStock = color[5];
        } else if (color && typeof color === 'object') {
            name = color.name;
            hex = color.hex || color.value;
            image = color.image || color.img || color.imageUrl;
            sizes = color.sizes;
            stock = color.stock;
            sizeStock = color.sizeStock || color.sizesStock;
        } else {
            name = color;
            hex = '#cccccc';
        }
        var qty = null;
        if (stock !== undefined && stock !== null && stock !== '') {
            qty = Math.max(0, parseInt(stock, 10) || 0);
        }
        var bySize = null;
        if (sizeStock && typeof sizeStock === 'object' && !Array.isArray(sizeStock)) {
            bySize = {};
            Object.keys(sizeStock).forEach(function (key) {
                var v = sizeStock[key];
                if (v !== undefined && v !== null && v !== '') {
                    bySize[String(key).trim()] = Math.max(0, parseInt(v, 10) || 0);
                }
            });
            if (!Object.keys(bySize).length) bySize = null;
        }
        return [
            String(name || '').trim(),
            String(hex || '#cccccc').trim(),
            String(image || '').trim(),
            splitList(sizes),
            qty,
            bySize
        ];
    }

    function recordFromRow(row, idx) {
        var seed = idx + 1;
        var slug = slugify(row[0]);
        var sizeSet = row[10].length ? row[10] : (SIZE_SETS[row[0]] || []);
        var rawColors = row[9] || [];

        var colors = rawColors.map(function (c, ci) {
            return [
                c[0],
                c[1],
                variantImage(slug, seed, ci, rawColors.length),
                sizeSet.slice(),
                null,
                null
            ];
        });

        var images = [];
        colors.forEach(function (c) {
            if (c[2] && images.indexOf(c[2]) === -1) images.push(c[2]);
        });
        buildImages(slug, seed + 2).forEach(function (src) {
            if (images.indexOf(src) === -1 && images.length < 4) images.push(src);
        });
        if (!images.length) images = buildImages(slug, seed);

        var badges = [];
        if (idx % 11 === 3) badges.push('bestseller');
        if (idx % 13 === 5) badges.push('new');
        return {
            id: 'p' + String(seed).padStart(3, '0'),
            name: row[1],
            brand: row[2],
            category: row[0],
            price: row[3],
            mrp: row[4],
            rating: row[5],
            reviewCount: row[6],
            stock: row[7],
            images: images,
            colors: colors,
            sizes: sizeSet,
            description: row[11],
            highlights: row[12],
            badges: badges,
            keywords: row[8],
            visible: true,
            sortOrder: idx
        };
    }

    var DEFAULT_RECORDS = RAW.map(recordFromRow);

    var BUILTIN_BY_ID = {};
    DEFAULT_RECORDS.forEach(function (rec) { BUILTIN_BY_ID[rec.id] = rec; });

    function normalize(record, idx) {
        record = record || {};
        var seed = (idx || 0) + 1;
        var name = String(record.name || 'Untitled product').trim() || 'Untitled product';
        var brand = String(record.brand || 'Generic').trim() || 'Generic';
        var category = String(record.category || 'Electronics').trim() || 'Electronics';
        var price = Math.max(0, Number(record.price) || 0);
        var mrp = Math.max(price, Number(record.mrp) || price);
        var off = mrp > price ? Math.round((1 - (price / mrp)) * 100) : 0;
        var rating = clamp(Number(record.rating) || 4.5, 0, 5);
        var reviewCount = Math.max(0, parseInt(record.reviewCount, 10) || 0);
        var stock = parseInt(record.stock, 10);
        if (isNaN(stock)) stock = 0;
        stock = Math.max(0, stock);

        var id = String(record.id || '').trim() || ('p' + String(seed).padStart(3, '0'));

        var images = splitList(record.images).filter(function (src) {
            return /^https?:\/\//i.test(src) || /^data:image\//i.test(src) || /^assets\//i.test(src);
        });
        if (!images.length) images = buildImages(slugify(category), seed);

        var colors = (Array.isArray(record.colors) ? record.colors : [])
            .map(sanitizeColor)
            .filter(function (c) { return c[0]; });

        var builtin = BUILTIN_BY_ID[id];
        if (builtin) {
            colors.forEach(function (c) {
                var match = null;
                builtin.colors.forEach(function (bc) {
                    if (bc[0] === c[0]) match = bc;
                });
                if (match) {
                    if (!c[2] && match[2]) c[2] = match[2];
                    if ((!c[3] || !c[3].length) && match[3] && match[3].length) c[3] = match[3].slice();
                }
            });
            var merged = [];
            builtin.images.forEach(function (src) { if (merged.indexOf(src) === -1) merged.push(src); });
            images.forEach(function (src) { if (merged.indexOf(src) === -1) merged.push(src); });
            images = merged;
        }

        var sizes = splitList(record.sizes);
        var highlights = splitList(record.highlights);
        var badges = Array.isArray(record.badges) ? record.badges.slice() : splitList(record.badges);

        var tags = [];
        if (off > 0) tags.push('sale');
        if (badges.indexOf('new') !== -1) tags.push('new');
        if (badges.indexOf('bestseller') !== -1) tags.push('bestseller');
        if (stock > 0 && stock <= 8) tags.push('lowstock');

        var sku = String(record.sku || '').trim() ||
            ('NC' + id.toUpperCase().replace('P', '') + '-' + brand.slice(0, 2).toUpperCase());

        var specs = Array.isArray(record.specs) && record.specs.length
            ? record.specs.map(function (row) { return Array.isArray(row) ? row.slice() : row; })
            : buildSpecs(category, brand, name, sku);
        specs = specs.map(function (row) {
            return (Array.isArray(row) && /model\s*code/i.test(String(row[0] || ''))) ? [row[0], sku] : row;
        });
        if (!specs.some(function (row) { return Array.isArray(row) && /sku|model\s*code/i.test(String(row[0] || '')); })) {
            specs.push(['SKU code', sku]);
        }
        if (!specs.some(function (row) { return Array.isArray(row) && /product\s*(id|code)/i.test(String(row[0] || '')); })) {
            specs.push(['Product ID', id]);
        }

        var product = {
            id: id,
            name: name,
            slug: slugify(name),
            brand: brand,
            category: category,
            categorySlug: slugify(category),
            price: price,
            mrp: mrp,
            discountPct: off,
            rating: rating,
            reviewCount: reviewCount,
            stock: stock,
            images: images,
            colors: colors,
            sizes: sizes,
            description: String(record.description || ''),
            highlights: highlights,
            tags: tags,
            badges: badges,
            specs: specs,
            reviews: [],
            breakdown: buildRatingBreakdown(rating, reviewCount),
            freeShipping: price >= 999,
            keywords: splitList(record.keywords),
            sku: sku,
            visible: record.visible !== false,
            sortOrder: record.sortOrder != null ? Number(record.sortOrder) : (idx || 0)
        };

        return product;
    }

    var DEFAULT_PRODUCTS = DEFAULT_RECORDS.map(normalize);

    var products = [];
    var byIdMap = {};
    var brandList = [];
    var prices = [];
    var categoryCounts = {};

    function reindex(list) {
        products = list || [];
        byIdMap = {};
        brandList = [];
        prices = [];
        categoryCounts = {};

        products.forEach(function (p) {
            byIdMap[p.id] = p;
            if (brandList.indexOf(p.brand) === -1) brandList.push(p.brand);
            prices.push(p.price);
            categoryCounts[p.category] = (categoryCounts[p.category] || 0) + 1;
        });
        brandList.sort();

        if (NC.data) {
            NC.data.products = products;
            NC.data.brands = brandList;
            NC.data.priceBounds = prices.length
                ? { min: Math.min.apply(null, prices), max: Math.max.apply(null, prices) }
                : { min: 0, max: 0 };
        }
    }

    function setProducts(list) {
        reindex((list || []).slice());
    }

    function rawRecords() {
        return DEFAULT_RECORDS.map(function (rec) {
            return JSON.parse(JSON.stringify(rec));
        });
    }

    function getCategories() {
        // Only show categories that actually exist in the catalog (the ones the
        // store owner added/imported from the admin panel) — never the built-in
        // defaults on their own.
        var icons = {};
        CATEGORIES.forEach(function (c) { icons[c.slug] = c.icon; });
        var out = Object.keys(categoryCounts).map(function (name) {
            var slug = slugify(name);
            return { slug: slug, name: name, icon: icons[slug] || 'i-tag', count: categoryCounts[name] };
        });
        out.sort(function (a, b) {
            return String(a.name).localeCompare(String(b.name), undefined, { sensitivity: 'base' });
        });
        return out;
    }

    function getById(id) {
        return byIdMap[id] || null;
    }

    // Image for the exact variant (color) a shopper picked. Falls back to the
    // first color's image, then the product's first image.
    function variantImageFor(product, color) {
        if (!product) return (NC.data && NC.data.placeholder) || '';
        var colors = product.colors || [];
        var name = String(color == null ? '' : color).trim();
        if (name) {
            for (var i = 0; i < colors.length; i++) {
                if (colors[i] && String(colors[i][0]).trim() === name && colors[i][2]) {
                    return colors[i][2];
                }
            }
        }
        if (colors[0] && colors[0][2]) return colors[0][2];
        return (product.images && product.images[0]) || (NC.data && NC.data.placeholder) || '';
    }

    function getRelated(product, limit) {
        var scored = products
            .filter(function (p) { return p.id !== product.id; })
            .map(function (p) {
                var score = 0;
                if (p.category === product.category) score += 10;
                if (p.brand === product.brand) score += 6;
                if (Math.abs(p.price - product.price) / Math.max(product.price, 1) < 0.3) score += 4;
                score += 2 - Math.abs(p.rating - product.rating);
                return { p: p, score: score };
            })
            .sort(function (a, b) { return b.score - a.score; });
        return scored.slice(0, limit || 4).map(function (s) { return s.p; });
    }

    function search(query) {
        var q = String(query || '').trim().toLowerCase();
        if (!q) return [];
        var terms = q.split(/\s+/);
        return products
            .map(function (p) {
                var haystack = (p.name + ' ' + p.brand + ' ' + p.category + ' ' + p.keywords.join(' ')).toLowerCase();
                var score = 0;
                terms.forEach(function (t) {
                    if (haystack.indexOf(t) !== -1) score += 2;
                    if (p.name.toLowerCase().indexOf(t) === 0) score += 3;
                    if (p.brand.toLowerCase() === t) score += 4;
                });
                return { p: p, score: score };
            })
            .filter(function (r) { return r.score > 0; })
            .sort(function (a, b) { return b.score - a.score || b.p.rating - a.p.rating; })
            .map(function (r) { return r.p; });
    }

    NC.data = {
        products: products,
        categories: getCategories,
        brands: brandList,
        priceBounds: { min: 0, max: 0 },
        byId: getById,
        variantImage: variantImageFor,
        related: getRelated,
        search: search,
        placeholder: 'assets/placeholder.svg',
        normalize: normalize,
        setProducts: setProducts,
        rawRecords: rawRecords,
        defaults: function () { return DEFAULT_PRODUCTS.slice(); },
        reset: function () { reindex(DEFAULT_PRODUCTS.slice()); }
    };

    reindex(DEFAULT_PRODUCTS);
})();