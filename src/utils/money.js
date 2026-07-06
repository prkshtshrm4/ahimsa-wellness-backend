// All money is integer paise. These helpers compute discounts + totals.

export function computeAmounts(subtotalInPaise, discount = { type: 'none', value: 0 }) {
  let discountInPaise = 0;
  if (discount?.type === 'percent') {
    discountInPaise = Math.round((subtotalInPaise * Math.min(Math.max(discount.value, 0), 100)) / 100);
  } else if (discount?.type === 'flat') {
    discountInPaise = Math.max(0, Math.round(discount.value));
  }
  discountInPaise = Math.min(discountInPaise, subtotalInPaise);
  const totalInPaise = subtotalInPaise - discountInPaise;
  return { subtotalInPaise, discountInPaise, totalInPaise };
}

export const rupees = (paise) => (paise / 100).toLocaleString('en-IN', { maximumFractionDigits: 2 });
