import { haversineDistanceKm } from './distance.js'

test('distance between the same point is 0', () => {
  expect(haversineDistanceKm(32.08, 34.78, 32.08, 34.78)).toBeCloseTo(0, 5)
})

test('distance between Tel Aviv and Jerusalem is about 54km', () => {
  const km = haversineDistanceKm(32.0853, 34.7818, 31.7683, 35.2137)
  expect(km).toBeGreaterThan(50)
  expect(km).toBeLessThan(60)
})
