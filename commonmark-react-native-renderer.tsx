import React from "react";
import {
    Text,
    View,
    Linking,
} from "react-native";
import assign from "lodash.assign";
import isPlainObject from "lodash.isplainobject";
import xssFilters from "xss-filters";
import pascalCase from "pascalcase";
import defaultStyles from "./styles";

const openUrl = (url) => {
    Linking.openURL(url).catch((error) => console.warn("An error occurred: ", error));
};

const typeAliases = {
    blockquote: "block_quote",
    thematicbreak: "thematic_break",
    htmlblock: "html_block",
    htmlinline: "html_inline",
    codeblock: "code_block",
    hardbreak: "linebreak",
};

const defaultRenderers = {
    block_quote: (props) => {
        const newProps = assign({}, props);
        const style = newProps.style;
        delete newProps.style;
        return <View style={style}><Text {...newProps} /></View>;
    },
    emph: "em",
    linebreak: "br",
    image: "img",
    item: "li",
    link: "a",
    paragraph: "p",
    strong: "strong",
    thematic_break: "hr", // eslint-disable-line camelcase

    html_block: HtmlRenderer,
    html_inline: HtmlRenderer,
    list: function List(props) {
        const tag = props.type.toLowerCase() === "bullet" ? "ul" : "ol";
        const attrs = getCoreProps(props);

        if (props.start !== null && props.start !== 1) {
            attrs.start = props.start.toString();
        }

        return createElement(tag, attrs, props.children);
    },
    code_block: function CodeBlock(props) {
        const className = props.language && "language-" + props.language;
        const code = createElement("code", { className }, props.literal);
        return createElement("pre", getCoreProps(props), code);
    },
    code: function Code(props) {
        return createElement("code", getCoreProps(props), props.children);
    },
    heading: function Heading(props) {
        return createElement("h" + props.level, getCoreProps(props), props.children);
    },

    text: null,
    softbreak: null,
};

const coreTypes = Object.keys(defaultRenderers);

function getCoreProps(props) {
    return {
        "key": props.nodeKey,
        "data-sourcepos": props["data-sourcepos"],
    };
}

function normalizeTypeName(typeName) {
    const norm = typeName.toLowerCase();
    const type = typeAliases[norm] || norm;
    return typeof defaultRenderers[type] !== "undefined" ? type : typeName;
}

function normalizeRenderers(renderers) {
    return Object.keys(renderers || {}).reduce(function(normalized, type) {
        const norm = normalizeTypeName(type);
        normalized[norm] = renderers[type];
        return normalized;
    }, {});
}

function HtmlRenderer(props) {
    const nodeProps = props.escapeHtml ? {} : { dangerouslySetInnerHTML: { __html: props.literal } };
    const children = props.escapeHtml ? [props.literal] : null;

    if (props.escapeHtml || !props.skipHtml) {
        return createElement(props.isBlock ? "div" : "span", nodeProps, children);
    }
}

function isGrandChildOfList(node) {
    const grandparent = node.parent.parent;
    return (
        grandparent &&
        grandparent.type.toLowerCase() === "list" &&
        grandparent.listTight
    );
}

function addChild(node, child) {
    let parent = node;
    do {
        parent = parent.parent;
    } while (!parent.react);

    parent.react.children.push(child);
}

function createElement(tagName, props, children) {
    const nodeChildren = Array.isArray(children) && children.reduce(reduceChildren, []);
    const args = [tagName, props].concat(nodeChildren || children);
    return React.createElement.apply(React, args);
}

function reduceChildren(children, child) {
    const lastIndex = children.length - 1;
    if (typeof child === "string" && typeof children[lastIndex] === "string") {
        children[lastIndex] += child;
    } else {
        children.push(child);
    }

    return children;
}

function flattenPosition(pos) {
    return [
        pos[0][0], ":", pos[0][1], "-",
        pos[1][0], ":", pos[1][1],
    ].map(String).join("");
}

// For some nodes, we want to include more props than for others
function getNodeProps(node, key, opts, renderer) {
    const props = { key }, undef;

    // `sourcePos` is true if the user wants source information (line/column info from markdown source)
    if (opts.sourcePos && node.sourcepos) {
        props["data-sourcepos"] = flattenPosition(node.sourcepos);
    }
    const parent = node.parent;

    const type = normalizeTypeName(node.type);
    switch (type) {
        case "block_quote":
            props.style = opts.styles.blockQuote;
            break;
        case "code_block":
            const codeInfo = node.info ? node.info.split(/ +/) : [];
            if (codeInfo.length > 0 && codeInfo[0].length > 0) {
                props.language = codeInfo[0];
                props.codeinfo = codeInfo;
            }
            props.children = node.literal;
            props.style = opts.styles.codeBlock;
            break;
        case "code":
            props.children = node.literal;
            props.inline = true;
            break;
        case "heading":
            props.style = opts.styles[type];
            props.level = node.level;
            break;
        case "softbreak":
            props.softBreak = opts.softBreak;
            break;
        case "link":
            const url = opts.transformLinkUri ? opts.transformLinkUri(node.destination) : node.destination;
            props.title = node.title || undef;
            if (opts.linkTarget) {
                props.target = opts.linkTarget;
            }
            props.onPress = () => openUrl(url);
            props.style = url.match(/@/) ? opts.styles.mailTo : opts.styles.link;
            break;
        case "image":
            props.source = {uri: opts.transformImageUri ? opts.transformImageUri(node.destination) : node.destination};
            props.style = {width: 200, height: 300};

            // Commonmark treats image description as children. We just want the text
            node.react.children = undef;
            break;
        case "list":
            props.style = opts.styles[type];
            props.start = node.listStart;
            props.type = node.listType;
            props.tight = node.listTight;
            break;
        case "text":
            props.children = node.literal;
            props.style = opts.styles[type];
            console.log("text parent.type", parent.type);
            switch (parent.type) {
                case "heading":
                    props.style = assign({}, opts.styles[parent.type + parent.level], props.style);
                    break;
            }
            break;
        case "paragraph":
            props.style = opts.styles[type];
            break;
        case "item":
            props.style = opts.styles.listItem;
            break;
        default:
            props.style = opts.styles[type];
            break;
    }

    if (typeof renderer !== "string") {
        props.literal = node.literal;
    }

    const children = props.children || (node.react && node.react.children);
    if (Array.isArray(children)) {
        props.children = children.reduce(reduceChildren, []) || null;
    }

    return props;
}

function getPosition(node) {
    if (!node) {
        return null;
    }

    if (node.sourcepos) {
        return flattenPosition(node.sourcepos);
    }

    return getPosition(node.parent);
}

function renderNodes(block) {
    const walker = block.walker();

    // Softbreaks are usually treated as newlines, but in HTML we might want explicit linebreaks
    const softBreak = (
        this.softBreak === "br" ?
            React.createElement("br") :
            this.softBreak
    );

    const propOptions = {
        sourcePos: this.sourcePos,
        escapeHtml: this.escapeHtml,
        skipHtml: this.skipHtml,
        transformLinkUri: this.transformLinkUri,
        transformImageUri: this.transformImageUri,
        softBreak,
        linkTarget: this.linkTarget,
        styles: this.styles,
        listItemBulletType: this.listItemBulletType,
    };

    let e, node, entering, leaving, type, doc, key, nodeProps, prevPos, prevIndex = 0;
    while ((e = walker.next())) {
        const pos = getPosition(e.node.sourcepos ? e.node : e.node.parent);
        if (prevPos === pos) {
            key = pos + prevIndex;
            prevIndex++;
        } else {
            key = pos;
            prevIndex = 0;
        }

        prevPos = pos;
        entering = e.entering;
        leaving = !entering;
        node = e.node;
        type = normalizeTypeName(node.type);
        console.log(type);
        nodeProps = null;
        // If we have not assigned a document yet, assume the current node is just that
        if (!doc) {
            doc = node;
            node.react = { children: [] };
            continue;
        } else if (node === doc) {
            // When we're leaving...
            continue;
        }

        // In HTML, we don't want paragraphs inside of list items
        if (type === "paragraph" && isGrandChildOfList(node)) {
            continue;
        }

        // If we're skipping HTML nodes, don't keep processing
        if (this.skipHtml && (type === "html_block" || type === "html_inline")) {
            continue;
        }

        const isDocument = node === doc;
        const disallowedByConfig = this.allowedTypes.indexOf(type) === -1;
        let disallowedByUser = false;

        // Do we have a user-defined function?
        const isCompleteParent = node.isContainer && leaving;
        const renderer = this.renderers[type];
        if (this.allowNode && (isCompleteParent || !node.isContainer)) {
            const nodeChildren = isCompleteParent ? node.react.children : [];

            nodeProps = getNodeProps(node, key, propOptions, renderer);
            disallowedByUser = !this.allowNode({
                type: pascalCase(type),
                renderer: this.renderers[type],
                props: nodeProps,
                children: nodeChildren,
            });
        }

        if (!isDocument && (disallowedByUser || disallowedByConfig)) {
            if (!this.unwrapDisallowed && entering && node.isContainer) {
                walker.resumeAt(node, false);
            }

            continue;
        }

        const isSimpleNode = type === "text" || type === "softbreak";
        if (typeof renderer !== "function" && !isSimpleNode && typeof renderer !== "string") {
            throw new Error(
                "Renderer for type `" + pascalCase(node.type) + "` not defined or is not renderable",
            );
        }

        if (node.isContainer && entering) {
            const containerProps = {};
            let containerChildren = [];
            switch (node.parent.type) {
                case "list":
                    containerProps.style = this.styles.listItem;
                    if (node.listType == "bullet") {
                        containerChildren = [React.createElement(Text, {key: getPosition(node) + "_bullet"}, `${this.listItemBulletType}`)];
                    } else {
                        containerChildren = [React.createElement(Text, {key: getPosition(node) + "_bullet"}, node.listStart + ". ")];
                    }
                    break;
            }
            node.react = {
                component: renderer,
                props: containerProps,
                children: containerChildren,
            };
        } else {
            let childProps = nodeProps || getNodeProps(node, key, propOptions, renderer);
            if (renderer) {
                childProps = typeof renderer === "string"
                    ? childProps
                    : assign(childProps, {nodeKey: childProps.key});

                addChild(node, React.createElement(renderer, childProps));
            } else if (type === "text") {
                addChild(node, node.literal);
            } else if (type === "softbreak") {
                addChild(node, softBreak);
            }
        }
    }

    return doc.react.children;
}

function defaultLinkUriFilter(uri) {
    const url = uri.replace(/file:\/\//g, "x-file://");

    // React does a pretty swell job of escaping attributes,
    // so to prevent double-escaping, we need to decode
    return decodeURI(xssFilters.uriInDoubleQuotedAttr(url));
}

function ReactNativeRenderer(options) {
    const opts = options || {};

    if (opts.allowedTypes && opts.disallowedTypes) {
        throw new Error("Only one of `allowedTypes` and `disallowedTypes` should be defined");
    }

    if (opts.allowedTypes && !Array.isArray(opts.allowedTypes)) {
        throw new Error("`allowedTypes` must be an array");
    }

    if (opts.disallowedTypes && !Array.isArray(opts.disallowedTypes)) {
        throw new Error("`disallowedTypes` must be an array");
    }

    if (opts.allowNode && typeof opts.allowNode !== "function") {
        throw new Error("`allowNode` must be a function");
    }

    let linkFilter = opts.transformLinkUri;
    if (typeof linkFilter === "undefined") {
        linkFilter = defaultLinkUriFilter;
    } else if (linkFilter && typeof linkFilter !== "function") {
        throw new Error("`transformLinkUri` must either be a function, or `null` to disable");
    }

    const imageFilter = opts.transformImageUri;
    if (typeof imageFilter !== "undefined" && typeof imageFilter !== "function") {
        throw new Error("`transformImageUri` must be a function");
    }

    if (opts.renderers && !isPlainObject(opts.renderers)) {
        throw new Error("`renderers` must be a plain object of `Type`: `Renderer` pairs");
    }

    let allowedTypes = (opts.allowedTypes && opts.allowedTypes.map(normalizeTypeName)) || coreTypes;
    if (opts.disallowedTypes) {
        const disallowed = opts.disallowedTypes.map(normalizeTypeName);
        allowedTypes = allowedTypes.filter(function filterDisallowed(type) {
            return disallowed.indexOf(type) === -1;
        });
    }

    return {
        sourcePos: Boolean(opts.sourcePos),
        softBreak: opts.softBreak || "\n",
        renderers: assign({}, defaultRenderers, normalizeRenderers(opts.renderers)),
        escapeHtml: Boolean(opts.escapeHtml),
        skipHtml: Boolean(opts.skipHtml),
        transformLinkUri: linkFilter,
        transformImageUri: imageFilter,
        allowNode: opts.allowNode,
        allowedTypes,
        unwrapDisallowed: Boolean(opts.unwrapDisallowed),
        render: renderNodes,
        styles: assign({}, defaultStyles, opts.styles),
        linkTarget: opts.linkTarget || false,
        listItemBulletType: opts.listItemBulletType || "\u2022 ",
    };
}

ReactNativeRenderer.uriTransformer = defaultLinkUriFilter;
ReactNativeRenderer.types = coreTypes.map(pascalCase);
ReactNativeRenderer.renderers = coreTypes.reduce(function(renderers, type) {
    renderers[pascalCase(type)] = defaultRenderers[type];
    return renderers;
}, {});

module.exports = ReactNativeRenderer;
