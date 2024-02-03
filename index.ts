import { getAssetFromKV } from "@cloudflare/kv-asset-handler";
import parser from "accept-language-parser";

// do not set to true in production!
const DEBUG = false;

addEventListener("fetch", (event) => {
  event.respondWith(handleEvent(event));
});

const enMessageObj = {
  title: "Sample Site",
  headline: "Sample Site",
  subtitle:
    "This is my sample site. Depending on where in the world you are visiting this site, this text will be translated into the corresponding language.",
  disclaimer:
    "Disclaimer: The initial translations are from Google Translate, so they may not be perfect!",
  tutorial:
    "Find the tutorial for this project in the Cloudflare Workers documentation.",
  copyright: "Design by HTML5 UP.",
};

type I18nMessageObject = typeof enMessageObj;
type I18nMessageObjectKey = keyof I18nMessageObject;
type SupportedLanguages = "en" | "de" | "ja";
type I18nMessages = Record<SupportedLanguages, I18nMessageObject>;

// 参考: https://developers.cloudflare.com/workers/tutorials/localize-a-website/
// ソースコード: https://github.com/kristianfreeman/i18n-example-workers/tree/master
const strings: I18nMessages = {
  en: enMessageObj,
  de: {
    title: "Beispielseite",
    headline: "Beispielseite",
    subtitle:
      "Dies ist meine Beispielseite. Abhängig davon, wo auf der Welt Sie diese Site besuchen, wird dieser Text in die entsprechende Sprache übersetzt.",
    disclaimer:
      "Haftungsausschluss: Die anfänglichen Übersetzungen stammen von Google Translate, daher sind sie möglicherweise nicht perfekt!",
    tutorial:
      "Das Tutorial für dieses Projekt finden Sie in der Cloudflare Workers-Dokumentation.",
    copyright: "Design von HTML5 UP.",
  },
  ja: {
    title: "サンプルサイト",
    headline: "サンプルサイト",
    subtitle:
      "これは私の例のサイトです。 このサイトにアクセスする世界の場所に応じて、このテキストは対応する言語に翻訳されます。",
    disclaimer:
      "免責事項：最初の翻訳はGoogle翻訳からのものですので、完璧ではないかもしれません！",
    tutorial:
      "Cloudflare Workersのドキュメントでこのプロジェクトのチュートリアルを見つけてください。",
    copyright: "HTML5 UPによるデザイン。",
  },
};

const supportedLanguages = Object.keys(strings);

class I18nElementHandler implements HTMLRewriterElementContentHandlers {
  constructor(private countryStrings: I18nMessageObject) {
  }

  element(element: Element) {
    const i18nKey = element.getAttribute(
      "data-i18n-key",
    ) as I18nMessageObjectKey;
    if (i18nKey) {
      const translation = this.countryStrings[i18nKey];
      if (translation) {
        element.setInnerContent(translation);
      }
    }
  }
}

class HtmlElementHandler implements HTMLRewriterElementContentHandlers {
  constructor(private language: SupportedLanguages) {
  }

  element(element: Element) {
    element.setAttribute("lang", this.language);
  }
}

class HeadElementHandler implements HTMLRewriterElementContentHandlers {
  constructor(private countryStrings: I18nMessageObject) {
  }

  element(element: Element) {
    element.append(
      `<meta name="description" content="${this.countryStrings.subtitle}" />`,
      { html: true },
    );
  }
}

async function handleEvent(event: FetchEvent) {
  const url = new URL(event.request.url);
  try {
    let options = {};
    if (DEBUG) {
      options = {
        cacheControl: {
          bypassCache: true,
        },
      };
    }
    const languageHeader = event.request.headers.get("Accept-Language") ?? "en";
    const language: SupportedLanguages =
      parser.pick(supportedLanguages, languageHeader) as SupportedLanguages ??
        "en";
    const countryStrings = strings[language] || {};

    const page = await getAssetFromKV(event, options);

    const response = new HTMLRewriter()
      .on("html", new HtmlElementHandler(language))
      .on("head", new HeadElementHandler(countryStrings))
      .on("[data-i18n-key]", new I18nElementHandler(countryStrings))
      .transform(page);

    response.headers.set("X-Frame-Options", "DENY");
    response.headers.set("X-Content-Type-Options", "nosniff");

    return response;
  } catch (e) {
    // if an error is thrown try to serve the asset at 404.html
    if (!DEBUG) {
      try {
        let notFoundResponse = await getAssetFromKV(event, {
          mapRequestToAsset: (req) =>
            new Request(`${new URL(req.url).origin}/404.html`, req),
        });

        return new Response(notFoundResponse.body, {
          ...notFoundResponse,
          status: 404,
        });
      } catch (e) {}
    }

    if (!(e instanceof Error)) throw e;

    return new Response(e.message || e.toString(), { status: 500 });
  }
}
