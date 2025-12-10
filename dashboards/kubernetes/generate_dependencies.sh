#!/bin/bash

JSON_PATH='{
  "namespace": .metadata.namespace,
  "name": .metadata.name,
  "dependsOn": .spec.dependsOn
}'

KUSTOMIZATIONS_JSON=$(kubectl get kustomizations.kustomize.toolkit.fluxcd.io -A -o=json \
  | jq --arg path "$JSON_PATH" '
    [
      .items[] 
      | {
        namespace: .metadata.namespace, 
        name: .metadata.name, 
        dependsOn: (.spec.dependsOn // [])
      }
    ]
  ')

echo "$KUSTOMIZATIONS_JSON" | jq '
  [
    .[] 
    | {
      id: (.namespace + "/" + .name), 
      title: .name, 
      subTitle: .namespace
    }
  ]
' > nodes.json

echo "$KUSTOMIZATIONS_JSON" | jq '
  [
    .[] as $kustomization | $kustomization.dependsOn[] | {
      "id": ($kustomization.name + "-" + .name),
      "source": ($kustomization.namespace + "/" + $kustomization.name),
      "target": ((.namespace // $kustomization.namespace) + "/" + .name)
    }
  ]
' > edges.json
