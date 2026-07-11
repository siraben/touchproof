{
  description = "TouchProof development environment";

  inputs.nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";

  outputs = { self, nixpkgs }:
    let
      systems = [ "aarch64-darwin" "x86_64-linux" "aarch64-linux" ];
      forAllSystems = nixpkgs.lib.genAttrs systems;
    in {
      devShells = forAllSystems (system:
        let pkgs = import nixpkgs { inherit system; };
        in {
          default = pkgs.mkShell {
            packages = with pkgs; [ nodejs_24 git ];
            shellHook = ''
              export NEXT_TELEMETRY_DISABLED=1
              export COREPACK_HOME="$PWD/.cache/corepack"
              echo "TouchProof: Node $(node --version); use corepack pnpm"
            '';
          };
        });
    };
}
