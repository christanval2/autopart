const TVA = 0.1925;
const calc = (sub:number,ship=0,disc=0) => { const taxable=Math.max(0,sub-disc); const tax=Math.round(taxable*TVA); return { taxAmount:tax, totalAmount:Math.round(taxable+tax+ship) }; };
describe('TVA Cameroun 19.25%', () => {
  it('100 000 XAF → TVA 19 250', () => expect(calc(100_000).taxAmount).toBe(19_250));
  it('Total TTC correct', () => expect(calc(100_000).totalAmount).toBe(119_250));
  it('Remise déduite avant TVA', () => expect(calc(100_000,0,10_000).taxAmount).toBe(17_325));
  it('Frais livraison hors TVA', () => expect(calc(100_000,5_000).totalAmount).toBe(124_250));
});
describe('Commission 5%', () => {
  const comm = (total:number,rate=5) => Math.round(total*rate/100);
  it('5% sur 200 000 = 10 000', () => expect(comm(200_000)).toBe(10_000));
});
