import type { DesignJSON } from "./canvas-types";
import { resizeCanvasJSON } from "./document-size";

export const DESIGN_WIDTH = 960;
export const DESIGN_HEIGHT = 640;

import { libraryTemplates, libraryScene } from "./template-library";

export const templates = [
  ...libraryTemplates,
  {
    id: "studio",
    name: "Room for possibility",
    category: "Presentation",
    color: "#d9ed92",
    background: "#f5f2e9",
  },
  {
    id: "botanical",
    name: "A slower kind of living",
    category: "Editorial",
    color: "#b8c9a1",
    background: "#e9eddf",
  },
  {
    id: "midnight",
    name: "Ideas after dark",
    category: "Social & events",
    color: "#b5a3ec",
    background: "#262632",
  },
  {
    id: "blank",
    name: "Your next big idea",
    category: "Blank canvas",
    color: "#e9e6df",
    background: "#ffffff",
  },
] as const;

let objectIndex = 0;
function object(
  type: string,
  name: string,
  props: Record<string, unknown>,
): Record<string, unknown> {
  return {
    type,
    version: "6.9.0",
    id: `template-${++objectIndex}`,
    name,
    originX: "left",
    originY: "top",
    strokeWidth: 0,
    ...props,
  };
}
function text(name: string, value: string, props: Record<string, unknown>) {
  return object("Textbox", name, {
    text: value,
    fill: "#252821",
    fontFamily: "Arial",
    fontSize: 22,
    width: 500,
    ...props,
  });
}
function rect(name: string, props: Record<string, unknown>) {
  return object("Rect", name, props);
}
function circle(name: string, props: Record<string, unknown>) {
  return object("Circle", name, props);
}

/** Native Fabric JSON: every part of the artwork stays independently editable. */
export function createTemplate(
  id: string = "studio",
  width = DESIGN_WIDTH,
  height = DESIGN_HEIGHT,
): DesignJSON {
  return resizeCanvasJSON(templateScene(id), width, height, true);
}

function templateScene(id: string): DesignJSON {
  objectIndex = 0;
  const library = libraryScene(id);
  if (library) return library;
  if (id === "blank")
    return { version: "6.9.0", background: "#ffffff", objects: [] };
  if (id === "botanical")
    return {
      version: "6.9.0",
      background: "#e9eddf",
      objects: [
        text("Edition", "THE SLOW JOURNAL     /     VOL. 04", {
          left: 58,
          top: 40,
          fontSize: 13,
          charSpacing: 160,
        }),
        rect("Rule", {
          left: 58,
          top: 79,
          width: 844,
          height: 1,
          fill: "#697859",
        }),
        circle("Green circle", {
          left: 582,
          top: 137,
          radius: 170,
          fill: "#a7b891",
        }),
        object("Ellipse", "Leaf one", {
          left: 694,
          top: 173,
          rx: 56,
          ry: 132,
          fill: "#536c4c",
          angle: 25,
        }),
        object("Ellipse", "Leaf two", {
          left: 558,
          top: 321,
          rx: 51,
          ry: 113,
          fill: "#7d9267",
          angle: -36,
        }),
        rect("Plant stem", {
          left: 720,
          top: 209,
          width: 3,
          height: 321,
          fill: "#3e583b",
          angle: 15,
        }),
        text("Title", "A slower\nkind of living.", {
          left: 58,
          top: 185,
          width: 525,
          fontFamily: "Georgia",
          fontSize: 72,
          lineHeight: 1.03,
          fill: "#334a31",
        }),
        text(
          "Description",
          "Small moments. A little more intention.\nSpace to grow into yourself.",
          {
            left: 63,
            top: 417,
            width: 420,
            fontSize: 17,
            lineHeight: 1.5,
            fill: "#53624b",
          },
        ),
        text("Footer", "FIND YOUR OWN PACE", {
          left: 58,
          top: 579,
          fontSize: 11,
          charSpacing: 170,
        }),
        text("Page", "01", { left: 872, top: 579, fontSize: 13, width: 32 }),
      ],
    };
  if (id === "midnight")
    return {
      version: "6.9.0",
      background: "#252531",
      objects: [
        text("Edition", "AFTER HOURS   /   A CREATIVE GATHERING", {
          left: 58,
          top: 43,
          fontSize: 12,
          width: 600,
          fill: "#e4dff0",
          charSpacing: 150,
        }),
        circle("Orb", { left: 621, top: 146, radius: 172, fill: "#b5a3ec" }),
        circle("Inner orb", {
          left: 700,
          top: 224,
          radius: 91,
          fill: "#252531",
        }),
        rect("Orbit", {
          left: 598,
          top: 305,
          width: 360,
          height: 27,
          angle: -28,
          fill: "#d8ed94",
        }),
        text("Title", "Ideas\nafter dark.", {
          left: 58,
          top: 151,
          fontSize: 93,
          fontWeight: 700,
          width: 650,
          lineHeight: 0.98,
          fill: "#f5f1eb",
          charSpacing: -45,
        }),
        text("Subtitle", "For the beautifully restless minds.", {
          left: 64,
          top: 406,
          width: 540,
          fontSize: 23,
          fill: "#c0b8d1",
        }),
        rect("Divider", {
          left: 58,
          top: 539,
          width: 842,
          height: 1,
          fill: "#666274",
        }),
        text("Event date", "FRIDAY  /  19:00 TILL LATE", {
          left: 58,
          top: 565,
          width: 430,
          fontSize: 12,
          charSpacing: 110,
          fill: "#f5f1eb",
        }),
        text("Venue", "THE STUDIO, EVERYWHERE", {
          left: 610,
          top: 565,
          width: 300,
          textAlign: "right",
          fontSize: 12,
          charSpacing: 110,
          fill: "#f5f1eb",
        }),
      ],
    };
  return {
    version: "6.9.0",
    background: "#f5f2e9",
    objects: [
      text("Studio label", "STUDIO NOTES", {
        left: 58,
        top: 37,
        width: 260,
        fontSize: 12,
        fontWeight: 600,
        charSpacing: 190,
      }),
      text("Edition", "A LITTLE SPACE. A BIG IDEA.", {
        left: 586,
        top: 38,
        width: 316,
        textAlign: "right",
        fontSize: 10,
        charSpacing: 100,
      }),
      rect("Top rule", {
        left: 58,
        top: 75,
        width: 844,
        height: 1,
        fill: "#bbbeb0",
      }),
      circle("Possibility / lime", {
        left: 618,
        top: 157,
        radius: 147,
        fill: "#d4e78b",
      }),
      rect("Possibility / arch", {
        left: 677,
        top: 210,
        width: 176,
        height: 298,
        rx: 88,
        ry: 88,
        fill: "#252821",
        angle: 21,
      }),
      circle("Possibility / peach", {
        left: 769,
        top: 363,
        radius: 60,
        fill: "#e6b294",
      }),
      circle("Possibility / cutout", {
        left: 649,
        top: 272,
        radius: 51,
        fill: "#f5f2e9",
      }),
      object("Line", "Possibility / line", {
        left: 620,
        top: 452,
        x1: 0,
        y1: 0,
        x2: 269,
        y2: 0,
        stroke: "#707764",
        strokeWidth: 1,
        angle: -15,
      }),
      text("MAKE", "MAKE", {
        left: 54,
        top: 133,
        width: 590,
        fontSize: 115,
        fontWeight: 800,
        charSpacing: -70,
        lineHeight: 1,
      }),
      text("room for", "room for", {
        left: 61,
        top: 263,
        width: 564,
        fontFamily: "Georgia",
        fontSize: 75,
        fontStyle: "italic",
        charSpacing: -45,
      }),
      text("possibility.", "possibility.", {
        left: 57,
        top: 353,
        width: 625,
        fontSize: 76,
        fontWeight: 700,
        charSpacing: -50,
      }),
      text("Description", "Good things begin with a little room to play.", {
        left: 63,
        top: 470,
        width: 540,
        fontSize: 17,
        fill: "#65695e",
      }),
      rect("Bottom rule", {
        left: 58,
        top: 552,
        width: 844,
        height: 1,
        fill: "#bbbeb0",
      }),
      text("Footer", "CREATE SOMETHING THAT FEELS LIKE YOU.", {
        left: 58,
        top: 576,
        width: 720,
        fontSize: 10,
        charSpacing: 150,
      }),
      text("Page", "01 / 03", {
        left: 816,
        top: 574,
        width: 88,
        textAlign: "right",
        fontSize: 12,
        charSpacing: 60,
      }),
    ],
  };
}
