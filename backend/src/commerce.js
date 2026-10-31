export function calculateSubtotal(unitPrice, quantity) {
  if (!Number.isFinite(unitPrice) || unitPrice < 0 || !Number.isInteger(quantity) || quantity < 1) {
    throw new RangeError("A valid product price and quantity are required.");
  }
  return Math.round(unitPrice * quantity * 100) / 100;
}
