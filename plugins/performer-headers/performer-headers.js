/**
 * Performer Headers
 * Version: 1.0.0
 * Author: D67
 *
 * Displays a row of random scene screenshots
 * at the top of performer pages.
 *
 * Features:
 * - Random performer screenshots
 * - Improved image variety
 * - Scene title overlays
 * - Clickable scene navigation
 * - Smart caching
 * - Fast tab switching
 *
 * Compatible with:
 * - Stash v0.31.x+
 */

(function () {
    "use strict";

    const PLUGIN_NAME = "Performer Headers";
    const PLUGIN_VERSION = "1.0.0";

    const HEADER_ID = "performer-headers";
    const IMAGE_COUNT = 6;

    console.log(
        `[${PLUGIN_NAME} v${PLUGIN_VERSION}] Loaded`
    );

    const performerCache = new Map();
    const headerCache = new Map();

    let currentPerformerId = null;
    let buildInProgress = false;

    async function gql(query, variables = {}) {
        const response = await fetch("/graphql", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
            },
            body: JSON.stringify({
                query,
                variables,
            }),
        });

        return await response.json();
    }

    function getPerformerId() {
        const match = location.pathname.match(/^\/performers\/(\d+)/);
        return match ? match[1] : null;
    }

    function shuffle(array) {
        const copy = [...array];

        for (let i = copy.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [copy[i], copy[j]] = [copy[j], copy[i]];
        }

        return copy;
    }

    function selectDiverseScenes(scenes, count = IMAGE_COUNT) {

        const shuffled = shuffle(scenes);

        const selected = [];
        const usedTitles = new Set();

        for (const scene of shuffled) {

            const title = (scene.title || "")
                .toLowerCase()
                .trim();

            if (usedTitles.has(title)) {
                continue;
            }

            selected.push(scene);
            usedTitles.add(title);

            if (selected.length >= count) {
                break;
            }
        }

        // Fill remaining slots if performer has
        // fewer unique titles than IMAGE_COUNT

        if (selected.length < count) {

            for (const scene of shuffled) {

                if (selected.includes(scene)) {
                    continue;
                }

                selected.push(scene);

                if (selected.length >= count) {
                    break;
                }
            }
        }

        return selected;
    }

    async function getPerformerSceneImages(performerId) {

        if (performerCache.has(performerId)) {
            return performerCache.get(performerId);
        }

        try {

            const result = await gql(
                `
                query FindPerformer($id: ID!) {
                    findPerformer(id: $id) {
                        scenes {
                            id
                            title
                            paths {
                                screenshot
                            }
                        }
                    }
                }
                `,
                { id: performerId }
            );

            const performer = result?.data?.findPerformer;

            if (!performer) {
                return [];
            }

            const scenes =
                performer.scenes
                    ?.filter(
                        scene =>
                            scene?.paths?.screenshot &&
                            scene.paths.screenshot.length > 0
                    )
                    .map(scene => ({
                        id: scene.id,
                        title: scene.title,
                        image: scene.paths.screenshot,
                    })) || [];

            performerCache.set(performerId, scenes);

            return scenes;

        } catch (err) {
            console.error(
                `[${PLUGIN_NAME}] GraphQL Error`,
                err
            );
            return [];
        }
    }

    function removeHeader() {
        document.getElementById(HEADER_ID)?.remove();
    }

    function createHeader(scenes) {

        removeHeader();

        if (!scenes.length) {
            return;
        }

        const header = document.createElement("div");
        header.id = HEADER_ID;

        header.style.cssText = `
            width:100%;
            margin-bottom:20px;
            border-radius:10px;
            overflow:hidden;
            background:#111;
            border:1px solid rgba(255,255,255,.08);
        `;

        header.innerHTML = `
            <div id="performer-image-grid"
                 style="
                    display:grid;
                    grid-template-columns:repeat(${IMAGE_COUNT},1fr);
                    gap:4px;
                    padding:4px;
                 ">
            </div>
        `;

        const grid = header.querySelector("#performer-image-grid");

        scenes.forEach(scene => {

            const cell = document.createElement("a");

            cell.href = `/scenes/${scene.id}`;
            cell.title = scene.title;

            cell.style.cssText = `
                display:block;
                overflow:hidden;
                aspect-ratio:3/2;
                border-radius:6px;
                background:#000;
                position:relative;
                text-decoration:none;
                z-index:1;
            `;

            cell.innerHTML = `
                <img
                    src="${scene.image}"
                    loading="lazy"
                    style="
                        width:100%;
                        height:100%;
                        object-fit:cover;
                        transition:transform .25s ease;
                    "
                />

                <div class="scene-title-overlay"
                     style="
                        position:absolute;
                        left:0;
                        right:0;
                        bottom:0;
                        padding:6px 8px;
                        background:linear-gradient(
                            transparent,
                            rgba(0,0,0,.85)
                        );
                        color:white;
                        font-size:11px;
                        line-height:1.3;
                        opacity:0;
                        transition:opacity .2s ease;
                        pointer-events:none;
                        white-space:nowrap;
                        overflow:hidden;
                        text-overflow:ellipsis;
                    ">
                    ${scene.title}
                </div>
            `;

            const img = cell.querySelector("img");
            const overlay = cell.querySelector(".scene-title-overlay");

            cell.addEventListener("mouseenter", () => {
                img.style.transform = "scale(1.08)";
                overlay.style.opacity = "1";
            });

            cell.addEventListener("mouseleave", () => {
                img.style.transform = "scale(1)";
                overlay.style.opacity = "0";
            });

            cell.addEventListener("click", () => {
                console.log(
                    `[${PLUGIN_NAME}] Opening scene:`,
                    scene.id,
                    scene.title
                );
            });

            grid.appendChild(cell);
        });

        const target =
            document.querySelector(".detail-header") ||
            document.querySelector(".detail-container") ||
            document.querySelector("main");

        if (!target) {
            console.warn(
                `[${PLUGIN_NAME}] Could not find insertion point`
            );
            return;
        }

        target.prepend(header);
    }

    async function buildHeader() {

        if (buildInProgress) {
            return;
        }

        const performerId = getPerformerId();

        if (!performerId) {
            removeHeader();
            return;
        }

        if (document.getElementById(HEADER_ID)) {
            return;
        }

        buildInProgress = true;

        try {

            let selectedScenes;

            if (headerCache.has(performerId)) {

                selectedScenes =
                    headerCache.get(performerId);

            } else {

                const scenes =
                    await getPerformerSceneImages(
                        performerId
                    );

                if (!scenes.length) {
                    return;
                }

                selectedScenes =
                    selectDiverseScenes(
                        scenes,
                        IMAGE_COUNT
                    );

                headerCache.set(
                    performerId,
                    selectedScenes
                );
            }

            createHeader(selectedScenes);

        } finally {
            buildInProgress = false;
        }
    }

    function handleNavigation() {

        const performerId = getPerformerId();

        if (!performerId) {
            currentPerformerId = null;
            removeHeader();
            return;
        }

        if (performerId === currentPerformerId) {
            return;
        }

        currentPerformerId = performerId;

        removeHeader();

        setTimeout(buildHeader, 300);
    }

    const observer = new MutationObserver(() => {
        handleNavigation();
    });

    observer.observe(document.body, {
        subtree: true,
        childList: true,
    });

    window.addEventListener("popstate", () => {
        handleNavigation();
    });

    setTimeout(handleNavigation, 1000);

})();
