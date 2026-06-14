"""검증 대상 사이트 샘플.

⚠️ 법적 안전: 실제(playwright) 측정은 **동의/약관을 확인한 사이트에 한해**,
**결제 폼 도달까지만** 수행하라. 비동의 대량 주행·결제 제출은 금지(설계 원칙).
아래 'mock' 필드는 데모/CI용 시나리오일 뿐 실측값이 아니다.

각 항목: name, url, query(검색어), mock(데모 시나리오 | None=완주).
mock = {"stop": 퍼널키, "status": "fail"|"blocked", "reason": REASONS 키}
"""

from __future__ import annotations

SAMPLE_SITES: list[dict] = [
    {"name": "shop-a (Shopify)", "url": "https://example-a.com", "query": "tshirt",
     "mock": None},
    {"name": "shop-b (WooCommerce)", "url": "https://example-b.com", "query": "mug",
     "mock": {"stop": "reach_payment_form", "status": "fail", "reason": "otp_2fa"}},
    {"name": "shop-c (custom)", "url": "https://example-c.com", "query": "shoes",
     "mock": {"stop": "add_to_cart", "status": "fail", "reason": "element_not_found"}},
    {"name": "shop-d (marketplace)", "url": "https://example-d.com", "query": "book",
     "mock": {"stop": "load", "status": "blocked", "reason": "blocked_bot"}},
    {"name": "shop-e (DTC)", "url": "https://example-e.com", "query": "serum",
     "mock": None},
    {"name": "shop-f (enterprise)", "url": "https://example-f.com", "query": "laptop",
     "mock": {"stop": "enter_checkout", "status": "fail", "reason": "login_required"}},
    {"name": "shop-g (Shopify)", "url": "https://example-g.com", "query": "socks",
     "mock": {"stop": "open_cart", "status": "fail", "reason": "js_error"}},
    {"name": "shop-h (custom)", "url": "https://example-h.com", "query": "lamp",
     "mock": {"stop": "find_product", "status": "fail", "reason": "element_not_found"}},
    {"name": "shop-i (DTC)", "url": "https://example-i.com", "query": "candle",
     "mock": None},
    {"name": "shop-j (marketplace)", "url": "https://example-j.com", "query": "toy",
     "mock": {"stop": "reach_payment_form", "status": "fail", "reason": "timeout"}},
    {"name": "shop-k (enterprise)", "url": "https://example-k.com", "query": "tv",
     "mock": {"stop": "load", "status": "blocked", "reason": "blocked_bot"}},
    {"name": "shop-l (Shopify)", "url": "https://example-l.com", "query": "bag",
     "mock": {"stop": "enter_checkout", "status": "fail", "reason": "element_not_found"}},
]
