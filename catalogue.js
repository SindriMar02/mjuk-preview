/* Shared storefront boundary. Raw CM.all remains the source for stock, bags and old links. */
(function (root) {
  const display = p => p && p.choiceTitle ? { ...p, t: p.choiceTitle } : p;
  const card = p => {
    p = display(p);
    if (!p || !p.choices) return p;
    const prices = p.choices.map(o => o.p);
    return { ...p, p: Math.min(...prices), cp: 0, oos: p.choices.every(o => o.oos), choiceFrom: new Set(prices).size > 1 };
  };
  const listed = CM => (CM.all || []).filter(p => !p.choiceOf).map(card);
  const api = { display, card, listed };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.CMCatalogue = api;
})(typeof window !== 'undefined' ? window : globalThis);
