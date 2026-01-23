import json

def criar_json():
    item = {}
    item["id"] = input("Digite o id: ")
    item["name"] = input("Digite o nome: ")
    item["parent"] = input("Digite o parent: ")
    item["max"] = int(input("Digite o valor de max (número): "))
    item["icon"] = input("Digite o icon: ")

    print("Digite os requisitos no formato id,lvl (ex: espada,3).")
    print("Quando terminar, digite uma linha vazia e pressione ENTER.")
    # Inserir requires como lista de objetos
    item["requires"] = []
    while True:
        entrada = input()
        if entrada == "":
            break
        try:
            req_id, req_lvl = entrada.split(",")
            item["requires"].append({"id": req_id.strip(), "lvl": int(req_lvl.strip())})
        except ValueError:
            print("Formato inválido! Use id,lvl (ex: espada,3).")
    
    print("Digite a descrição (use ENTER para quebrar linhas).")
    print("Quando terminar, digite uma linha vazia e pressione ENTER.")
    linhas = []
    while True:
        linha = input()
        if linha == "":
            break
        linhas.append(linha)
    # Junta as linhas com \n
    item["desc"] = "\\n".join(linhas)

    return item


def main():
    lista = []
    while True:
        print("\n=== Criar novo JSON ===")
        lista.append(criar_json())

        continuar = input("Deseja adicionar outro? (s/n): ").lower()
        if continuar != "s":
            break

    print("\n=== Lista final de JSONs ===")
    print(json.dumps(lista, indent=2, ensure_ascii=False))


if __name__ == "__main__":
    main()
