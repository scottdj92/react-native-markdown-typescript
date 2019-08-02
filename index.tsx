import CommonMark from "commonmark";
import React from "react";
import {
  Image,
  ScrollView,
  Text,
  View,
} from "react-native";
import ReactNativeRenderer from "./commonmark-react-renderer";
import styles from "./styles";

interface IProps {
    children?: string;
}

export default class ReactNativeMarkdown extends React.Component<IProps> {
  public render() {
    const parser = new CommonMark.Parser();
    const renderer = new ReactNativeRenderer({
      skipHtml: true,
      allowedTypes: [
        "heading",
        "text",
        "paragraph",
        "strong",
        "emph",
        "list",
        "item",
        "image",
        "link",
        "code_block",
        "block_quote",
      ],
      renderers: {
        heading: View,
        paragraph: Text,
        text: Text,
        strong: Text,
        emph: Text,
        list: View,
        item: Text,
        image: Image,
        link: Text,
        code_block: Text,
      },
    });
    const ast = parser.parse(this.props.children || "");
    const children = renderer.render(ast);
    return (<ScrollView> {children} </ScrollView>);
  }
}
