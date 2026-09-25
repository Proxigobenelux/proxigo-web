/* ============================================================
   PROXIGO GROWTH TRACKER — V1
   Client-side event collector for PROXIGO Growth Agent.
   No secrets: uses the Supabase publishable key only.
   Analytics are OFF until explicit consent is granted.
   ============================================================ */

(function () {
  "use strict";

  const CONFIG = {
    supabaseUrl: "https://iyexxyhfuclwzftknynk.supabase.co",
    supabasePublishableKey: "sb_publishable_GvZVB758D9Mxp4fcYXhe1w_SjE_cFWz",
    consentKey: "proxigo_analytics_consent",
    sessionKey: "proxigo_growth_session_id"
  };

  const EVENTS_ENDPOINT =
    CONFIG.supabaseUrl + "/rest/v1/growth_events";

  const SESSIONS_ENDPOINT =
    CONFIG.supabaseUrl + "/rest/v1/growth_sessions";

  function hasConsent() {
    return localStorage.getItem(CONFIG.consentKey) === "accepted";
  }

  function getSessionId() {
    let id = localStorage.getItem(CONFIG.sessionKey);

    if (!id) {
      if (window.crypto && crypto.randomUUID) {
        id = crypto.randomUUID();
      } else {
        id = "sess_" + Date.now() + "_" + Math.random().toString(36).slice(2);
      }

      localStorage.setItem(CONFIG.sessionKey, id);
    }

    return id;
  }

  function safeUrl(url) {
    try {
      const parsed = new URL(url || window.location.href, window.location.origin);
      return parsed.origin + parsed.pathname;
    } catch {
      return window.location.origin + window.location.pathname;
    }
  }

  function getUtm() {
  const params = new URLSearchParams(window.location.search);

  return {
    source: params.get("utm_source"),
    medium: params.get("utm_medium"),
    campaign: params.get("utm_campaign"),
    content: params.get("utm_content"),
    term: params.get("utm_term")
  };
}
  

  function getProfessionalType() {
    const value =
      document.body?.dataset?.professionalType ||
      document.querySelector("[data-professional-type]")?.dataset?.professionalType ||
      null;

    return value ? String(value).slice(0, 100) : null;
  }

  async function post(endpoint, payload) {
    if (!hasConsent()) return;

    try {
      await fetch(endpoint, {
        method: "POST",
        keepalive: true,
        headers: {
          "Content-Type": "application/json",
          "apikey": CONFIG.supabasePublishableKey,
          "Authorization": "Bearer " + CONFIG.supabasePublishableKey,
          "Prefer": "return=minimal"
        },
        body: JSON.stringify(payload)
      });
    } catch (error) {
      console.debug("[PROXIGO Growth] tracking unavailable", error);
    }
  }

  async function ensureSession() {
    if (!hasConsent()) return;

    const sessionId = getSessionId();
    const utm = getUtm();

    await post(SESSIONS_ENDPOINT, {
      session_id: sessionId,
      source: utm.source,
      medium: utm.medium,
      campaign: utm.campaign,
      landing_page: safeUrl(window.location.href),
      device: /Mobi|Android/i.test(navigator.userAgent) ? "mobile" : "desktop"
    });
  }

  async function track(eventName, metadata = {}) {
  if (!hasConsent()) return;

  if (!eventName || typeof eventName !== "string") return;

  const cleanMetadata = {};
  let professionalType = getProfessionalType();

  Object.entries(metadata || {}).slice(0, 20).forEach(([key, value]) => {
    if (value === undefined || value === null) return;

    // Ne jamais envoyer de données sensibles.
    if (/password|token|secret|email|phone|telephone|contact/i.test(key)) {
      return;
    }

    // professional_type va dans sa colonne dédiée.
    if (key === "professional_type") {
      if (typeof value === "string") {
        professionalType = value.slice(0, 100);
      }
      return;
    }

    // Support de :
    // { metadata: { city: "Mons" } }
    if (key === "metadata" && value && typeof value === "object") {
      Object.entries(value).slice(0, 20).forEach(([metaKey, metaValue]) => {
        if (metaValue === undefined || metaValue === null) return;

        if (
          /password|token|secret|email|phone|telephone|contact/i.test(metaKey)
        ) {
          return;
        }

        const cleanValue =
          typeof metaValue === "string"
            ? metaValue.slice(0, 300)
            : metaValue;

        cleanMetadata[metaKey] = cleanValue;
      });

      return;
    }

    const stringValue =
      typeof value === "string"
        ? value.slice(0, 300)
        : value;

    cleanMetadata[key] = stringValue;
  });

  await post(EVENTS_ENDPOINT, {
    session_id: getSessionId(),
    event_name: eventName.slice(0, 100),
    page_url: safeUrl(window.location.href),
    professional_type: professionalType || null,
    metadata: cleanMetadata
  });
}

  function setConsent(value) {
    if (value === "accepted") {
      localStorage.setItem(CONFIG.consentKey, "accepted");
      ensureSession();
      track("page_view");
      return;
    }

    localStorage.removeItem(CONFIG.consentKey);
  }

  window.proxigoGrowth = {
    track,
    setConsent,
    getSessionId
  };

  document.addEventListener("DOMContentLoaded", function () {
    if (!hasConsent()) return;

    ensureSession();
    track("page_view");

    // Track meaningful CTA interactions without recording form contents.
    document.addEventListener("click", function (event) {
      const target = event.target.closest("a, button");

      if (!target) return;

      const text = (target.textContent || "").trim().replace(/\s+/g, " ");

      if (!text) return;

      const isCta =
        target.matches(".btn, .cta, [data-growth-event], button") ||
        /inscri|connexion|abonn|commencer|trouver|demander|contacter|devis|opportunit|essai|pro/i.test(text);

      if (!isCta) return;

      const eventName =
        target.dataset.growthEvent || "cta_click";

      track(eventName, {
        element: target.tagName.toLowerCase(),
        label: text.slice(0, 120),
        destination: target.tagName.toLowerCase() === "a"
          ? safeUrl(target.href)
          : null
      });
    });

    // Form starts: only form identity, never field values.
    document.addEventListener("submit", function (event) {
      const form = event.target;

      if (!form || !form.id) return;

      if (form.id === "proForm") {
        track("signup_started", {
          form: "professional_registration"
        });
      }

      if (form.id === "clientForm") {
        track("service_request_started", {
          form: "client_request"
        });
      }
    }, true);
  });

  // Public helper for the existing authentication/subscription code.
  window.proxigoGrowthTrack = track;
})();
