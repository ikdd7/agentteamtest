"""플랫폼별 체크아웃 플레이북 — 단계별 후보 셀렉터.

쇼핑몰마다 DOM 이 달라 하드코딩이 불가하므로, 플랫폼(Shopify/WooCommerce/일반)을
감지해 그에 맞는 후보 셀렉터를 우선 시도하고, 일반 셀렉터로 폴백한다.
이 모듈은 순수 데이터/판정이라 브라우저 없이 단위 테스트가 된다.
"""

from __future__ import annotations

# 페이지 내용에 이 신호가 있으면 해당 플랫폼으로 본다.
PLATFORM_SIGNS: dict[str, tuple[str, ...]] = {
    "shopify": ("cdn.shopify.com", "myshopify.com"),
    "woocommerce": ("woocommerce", "/cart/?add-to-cart"),
    "magento": ("mage-init", "data-mage-init", "/static/version", "magento"),
    "opencart": ("route=product", "route=checkout", "opencart"),
}

# 봇 차단(챌린지)을 시사하는 *정밀* 신호(소문자 비교).
# 광범위 단어("cloudflare"=CDN, 단독 "captcha")는 오탐이 많아 제외하고,
# 실제 챌린지 페이지에만 나타나는 문구/마커만 사용한다.
BLOCK_SIGNS: tuple[str, ...] = (
    "just a moment...",
    "checking your browser before",
    "checking if the site connection is secure",
    "enable javascript and cookies to continue",
    "please enable javascript and cookies",
    "attention required! | cloudflare",
    "/cdn-cgi/challenge-platform",
    "access to this page has been denied",
    "you have been blocked",
    "please verify you are a human",
    "captcha-delivery.com",  # DataDome
    "px-captcha",            # PerimeterX
    "비정상적인 접근",
    "잠시 후 다시 시도",
)

# 단계별 후보 셀렉터(위에서부터 시도). 'generic'은 모든 플랫폼의 폴백.
PLAYBOOKS: dict[str, dict[str, list[str]]] = {
    "shopify": {
        "search": ['input[name="q"]', 'input[type="search"]'],
        "product_link": ['a[href*="/products/"]'],
        "add_to_cart": ['button[name="add"]', 'form[action*="/cart/add"] button[type="submit"]'],
        "cart": ['a[href="/cart"]', 'a[href*="/cart"]'],
        "cart_page": ['form[action="/cart"]', 'a[href*="/checkout"]'],
        "checkout": ['button[name="checkout"]', 'a[href*="/checkout"]'],
        "payment_field": ['iframe[src*="stripe"]', 'iframe[src*="shopifycs"]', 'input[name*="card"]'],
    },
    "woocommerce": {
        "search": ['input[name="s"]', 'input.search-field'],
        "product_link": ['a.woocommerce-LoopProduct-link', 'a[href*="/product/"]'],
        "add_to_cart": ['button.single_add_to_cart_button', 'a.add_to_cart_button'],
        "cart": ['a.cart-contents', 'a[href*="/cart"]'],
        "cart_page": ['a.checkout-button', 'a[href*="checkout"]'],
        "checkout": ['a.checkout-button', 'a[href*="/checkout"]'],
        "payment_field": ['#payment', 'iframe[src*="stripe"]', 'input[name*="card"]'],
    },
    "magento": {
        "search": ['input#search', 'input[name="q"]'],
        "product_link": ['.product-item-link', 'a.product-item-photo'],
        "add_to_cart": ['#product-addtocart-button', 'button.tocart'],
        "cart": ['a.action.showcart', 'a[href*="checkout/cart"]'],
        "cart_page": ['button[data-role="proceed-to-checkout"]', 'a[href*="checkout"]'],
        "checkout": ['button[data-role="proceed-to-checkout"]', 'a[href*="checkout"]'],
        "payment_field": ['iframe[src*="stripe"]', 'input[name*="card"]', '#payment'],
    },
    "opencart": {
        "search": ['input[name="search"]', 'input#search'],
        "product_link": ['.product-thumb a', 'a[href*="route=product"]'],
        "add_to_cart": ['#button-cart', 'button[onclick*="cart.add"]',
                        'button:has-text("Add to Cart")'],
        "cart": ['a[title="Shopping Cart"]', 'a[href*="route=checkout/cart"]'],
        "cart_page": ['a[href*="route=checkout/checkout"]'],
        "checkout": ['a[href*="route=checkout/checkout"]', 'a:has-text("Checkout")'],
        "payment_field": ['input[name*="card"]', '#payment', 'iframe[src*="stripe"]'],
    },
    "generic": {
        "search": ['input[type="search"]', 'input#search', 'input[name="q"]',
                   'input[name*="q"]', 'input[name*="search"]', 'input[placeholder*="검색"]',
                   'input[aria-label*="earch"]'],
        "product_link": ['.product-item-link', 'a.product-item-photo', '.product-thumb a',
                         '.product-image-wrapper a', '.product a', 'a[href*="product"]',
                         'a[href*="item"]'],
        "add_to_cart": ['button[aria-label*="cart" i]', 'a.add-to-cart', '.add-to-cart',
                        'button.tocart', 'button:has-text("Add to cart")',
                        'a:has-text("Add to cart")', 'button:has-text("장바구니")',
                        'button[name*="add"]'],
        "cart": ['button[aria-label*="cart" i]', 'a[aria-label*="cart" i]',
                 'a.shopping_cart_link', 'a[href*="view_cart"]', 'a[href*="cart"]'],
        "cart_page": ['a[href*="checkout"]', 'a.check_out', 'button:has-text("checkout")',
                      'button:has-text("Proceed")', 'button:has-text("결제")'],
        "checkout": ['a[href*="checkout"]', 'a.check_out', 'button:has-text("Checkout")',
                     'button:has-text("Proceed")', 'button:has-text("결제하기")'],
        "payment_field": ['iframe[src*="stripe"]', 'iframe[src*="paypal"]',
                          'input[name*="card_number"]', 'input[name="name_on_card"]',
                          'input[name*="card"]', 'input[autocomplete="cc-number"]', '#payment'],
    },
}


def detect_platform(page_html: str) -> str:
    """페이지 HTML 로 플랫폼을 추정(없으면 'generic')."""
    low = page_html.lower()
    for platform, signs in PLATFORM_SIGNS.items():
        if any(s in low for s in signs):
            return platform
    return "generic"


def is_blocked(page_html: str) -> bool:
    low = page_html.lower()
    return any(s in low for s in BLOCK_SIGNS)


def selectors_for(platform: str, step: str) -> list[str]:
    """해당 플랫폼의 단계 셀렉터 + generic 폴백(중복 제거, 순서 유지)."""
    out: list[str] = []
    for src in (PLAYBOOKS.get(platform, {}), PLAYBOOKS["generic"]):
        for sel in src.get(step, []):
            if sel not in out:
                out.append(sel)
    return out
