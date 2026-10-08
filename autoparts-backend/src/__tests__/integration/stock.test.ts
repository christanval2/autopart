const avail = (h:number,r:number) => h-r;
const reserve = (h:number,r:number,qty:number) => { if(avail(h,r)<qty) throw new Error('Stock insuffisant'); return {h,r:r+qty}; };
describe('Stock calculs', () => {
  it('disponible = onHand - reserved', () => expect(avail(10,3)).toBe(7));
  it('réservation ok', () => expect(reserve(10,2,5).r).toBe(7));
  it('rejet si insuffisant', () => expect(()=>reserve(10,2,9)).toThrow('Stock insuffisant'));
  it('deux commandes simultanées', () => { const s=reserve(8,0,5); expect(()=>reserve(s.h,s.r,5)).toThrow(); });
});
