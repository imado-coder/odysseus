# Third-party notices

## algeria-wilayas (MIT)

`assets/dz-locations.js` is generated from the `algeria-wilayas` npm package,
which supplies the 58 wilayas and 1,541 communes of Algeria.

Licensed under the MIT License. The MIT License requires that the copyright
notice and this permission notice accompany redistributions, which is why this
file ships with the theme.

```
MIT License

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```


## Arabic typefaces

Three font files under `assets/` are redistributed with this theme:

| File | Family | Copyright |
|---|---|---|
| `cairo-arabic.woff2` | Cairo (variable, Arabic subset) | Copyright the Cairo Project Authors — https://github.com/googlefonts/cairo |
| `tajawal-arabic-400.woff2` | Tajawal Regular (Arabic subset) | Copyright the Tajawal Project Authors — https://github.com/Boutros/Tajawal |
| `tajawal-arabic-700.woff2` | Tajawal Bold (Arabic subset) | Copyright the Tajawal Project Authors |

Both families are licensed under the SIL Open Font License, Version 1.1, which
permits redistribution — including bundled inside a commercial theme — provided
the fonts are not sold on their own and this notice travels with them. The full
licence text is at https://openfontlicense.org.

Each file is the Arabic subset only; the Latin glyphs are left to the font the
merchant selects in the theme editor. They are declared with `unicode-range`,
so a storefront that renders no Arabic never requests them.

## Preview photography

The images under `dev-preview/photos/` are Unsplash-licensed and are used only
by the local preview harness. They are not part of the uploadable theme and are
excluded from the distribution archive.
