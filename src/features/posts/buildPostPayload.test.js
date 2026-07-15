import { buildPostPayload } from './buildPostPayload.js'

test('maps a missing-pet form to a full post row, including reward and name', () => {
  const payload = buildPostPayload(
    {
      type: 'missing',
      species: 'cat',
      breed: 'Tabby',
      color: 'orange',
      size: 'small',
      collar: true,
      collarDescription: 'blue collar',
      microchipped: 'yes',
      distinctiveMarkings: 'white paw',
      petName: 'Milo',
      rewardAmount: '50',
      phoneNumber: '050-1234567',
      photoEmbedding: [0.1, 0.2, 0.3],
      locationLat: 32.08,
      locationLng: 34.78,
      locationText: 'Tel Aviv',
      dateLostOrFound: '2026-07-01',
    },
    'owner-1'
  )

  expect(payload).toEqual({
    owner_id: 'owner-1',
    type: 'missing',
    species: 'cat',
    breed: 'Tabby',
    color: 'orange',
    size: 'small',
    collar: true,
    collar_description: 'blue collar',
    microchipped: 'yes',
    distinctive_markings: 'white paw',
    pet_name: 'Milo',
    reward_amount: 50,
    phone_number: '050-1234567',
    photo_embedding: [0.1, 0.2, 0.3],
    location_lat: 32.08,
    location_lng: 34.78,
    location_text: 'Tel Aviv',
    date_lost_or_found: '2026-07-01',
    status: 'active',
  })
})

test('forces pet_name and reward_amount to null for a found-pet post', () => {
  const payload = buildPostPayload(
    {
      type: 'found',
      species: 'dog',
      petName: 'should be ignored',
      rewardAmount: '100',
      locationLat: 1,
      locationLng: 2,
      locationText: 'somewhere',
      dateLostOrFound: '2026-07-01',
    },
    'owner-2'
  )

  expect(payload.pet_name).toBeNull()
  expect(payload.reward_amount).toBeNull()
})

test('defaults phone_number to null when not provided', () => {
  const payload = buildPostPayload(
    {
      type: 'found',
      species: 'dog',
      locationLat: 1,
      locationLng: 2,
      locationText: 'somewhere',
      dateLostOrFound: '2026-07-01',
    },
    'owner-2'
  )

  expect(payload.phone_number).toBeNull()
})

test('defaults photo_embedding to null when no embedding was computed', () => {
  const payload = buildPostPayload(
    {
      type: 'found',
      species: 'dog',
      locationLat: 1,
      locationLng: 2,
      locationText: 'somewhere',
      dateLostOrFound: '2026-07-01',
    },
    'owner-2'
  )

  expect(payload.photo_embedding).toBeNull()
})
