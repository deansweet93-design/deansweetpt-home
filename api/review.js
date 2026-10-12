// /api/reviews.js
// Returns the live Google rating, review count and Google's five "most relevant"
// reviews for Dean Sweet Personal Training, for the homepage reviews section.
//
// Setup (once):
//   1. Google Cloud Console -> create a project -> enable "Places API (New)".
//   2. Create an API key. Restrict it to "Places API (New)".
//   3. Vercel -> Project -> Settings -> Environment Variables:
//        GOOGLE_PLACES_API_KEY = your key
//      (optional) GOOGLE_PLACE_ID = a different place ID, if the listing changes.
//   4. Redeploy.
//
// Cost guard: in Google Cloud -> APIs & Services -> Places API (New) -> Quotas,
// set a daily request cap of 30. That keeps you inside the free monthly
// allowance. When the cap is hit, this returns an error and the homepage simply
// keeps showing the three reviews written into the HTML.
//
// CommonJS, same as /api/subscribe.js. The key never reaches the browser.

const DEFAULT_PLACE_ID = "ChIJE5MhPdM_1GoRvgRDeQ60qZI"; // Dean Sweet Personal Training

module.exports = async (req, res) => {
  // Google's terms don't allow storing review content, so nothing is cached here.
  res.setHeader("Cache-Control", "no-store");

  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "method_not_allowed" });
  }

  const key = process.env.GOOGLE_PLACES_API_KEY;
  const placeId = process.env.GOOGLE_PLACE_ID || DEFAULT_PLACE_ID;
  if (!key) return res.status(503).json({ error: "not_configured" });

  try {
    const upstream = await fetch(
      "https://places.googleapis.com/v1/places/" + encodeURIComponent(placeId) + "?languageCode=en",
      {
        headers: {
          "X-Goog-Api-Key": key,
          "X-Goog-FieldMask": "rating,userRatingCount,googleMapsUri,reviews",
        },
      }
    );

    if (!upstream.ok) {
      return res.status(502).json({ error: "google_error", status: upstream.status });
    }

    const place = await upstream.json();
    const reviews = (place.reviews || [])
      .map((r) => {
        const author = r.authorAttribution || {};
        return {
          rating: r.rating,
          text: ((r.text && r.text.text) || (r.originalText && r.originalText.text) || "").trim(),
          when: r.relativePublishTimeDescription || "",
          author: author.displayName || "",
          authorUrl: author.uri || "",
          photo: author.photoUri || "",
          url: r.googleMapsUri || "",
        };
      })
      .filter((r) => r.text); // star-only reviews have nothing to show

    return res.status(200).json({
      rating: place.rating,
      count: place.userRatingCount,
      url: place.googleMapsUri || "",
      reviews,
    });
  } catch (err) {
    return res.status(502).json({ error: "fetch_failed" });
  }
};
