import { getUserLocation } from './geolocation.js'

test('resolves with lat/lng from navigator.geolocation', async () => {
  global.navigator.geolocation = {
    getCurrentPosition: (success) => success({ coords: { latitude: 1.5, longitude: 2.5 } }),
  }
  await expect(getUserLocation()).resolves.toEqual({ lat: 1.5, lng: 2.5 })
})

test('rejects when geolocation is unsupported', async () => {
  global.navigator.geolocation = undefined
  await expect(getUserLocation()).rejects.toThrow('Geolocation is not supported')
})
