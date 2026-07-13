export function buildPostPayload(formValues, ownerId) {
  const isMissing = formValues.type === 'missing'
  return {
    owner_id: ownerId,
    type: formValues.type,
    species: formValues.species,
    breed: formValues.breed || null,
    color: formValues.color || null,
    size: formValues.size || null,
    collar: Boolean(formValues.collar),
    collar_description: formValues.collar ? formValues.collarDescription || null : null,
    microchipped: formValues.microchipped || 'unknown',
    distinctive_markings: formValues.distinctiveMarkings || null,
    pet_name: isMissing ? formValues.petName || null : null,
    reward_amount: isMissing && formValues.rewardAmount ? Number(formValues.rewardAmount) : null,
    phone_number: formValues.phoneNumber || null,
    location_lat: formValues.locationLat,
    location_lng: formValues.locationLng,
    location_text: formValues.locationText,
    date_lost_or_found: formValues.dateLostOrFound,
    status: 'active',
  }
}
