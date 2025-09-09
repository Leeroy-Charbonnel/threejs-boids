export class KeyboardController {
    private keys: Set<string> = new Set();
    private callbacks: Map<string, () => void> = new Map();
    private isEnabled: boolean = true;

    constructor() {
        this.init();
    }

    private init(): void {
        document.addEventListener('keydown', this.onKeyDown.bind(this));
        document.addEventListener('keyup', this.onKeyUp.bind(this));
        document.addEventListener('blur', this.onBlur.bind(this));
    }

    private onKeyDown(event: KeyboardEvent): void {
        if (!this.isEnabled) return;
        
        const key = event.code.toLowerCase();
        
        if (!this.keys.has(key)) {
            this.keys.add(key);
            
            const callback = this.callbacks.get(key);
            if (callback) {
                callback();
            }
        }
    }

    private onKeyUp(event: KeyboardEvent): void {
        const key = event.code.toLowerCase();
        this.keys.delete(key);
    }

    private onBlur(): void {
        this.keys.clear();
    }

    public isPressed(key: string): boolean {
        return this.keys.has(key.toLowerCase());
    }

    public onKeyPress(key: string, callback: () => void): void {
        this.callbacks.set(key.toLowerCase(), callback);
    }

    public removeKeyPress(key: string): void {
        this.callbacks.delete(key.toLowerCase());
    }

    public enable(): void {
        this.isEnabled = true;
    }

    public disable(): void {
        this.isEnabled = false;
        this.keys.clear();
    }

    public destroy(): void {
        document.removeEventListener('keydown', this.onKeyDown.bind(this));
        document.removeEventListener('keyup', this.onKeyUp.bind(this));
        document.removeEventListener('blur', this.onBlur.bind(this));
        this.keys.clear();
        this.callbacks.clear();
    }
}