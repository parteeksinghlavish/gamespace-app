// Type declarations for local modules
declare module './NewSessionModal' {
  interface NewSessionModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSuccess: () => void;
  }
  
  const NewSessionModal: React.FC<NewSessionModalProps>;
  export default NewSessionModal;
}

declare module './CommentEditModal' {
  interface CommentEditModalProps {
    isOpen: boolean;
    onClose: () => void;
    session: any;
    onSuccess: () => void;
  }
  
  const CommentEditModal: React.FC<CommentEditModalProps>;
  export default CommentEditModal;
}

declare module './BillModal' {
  interface BillModalProps {
    isOpen: boolean;
    onClose: () => void;
    tokenId: number;
    onSuccess: () => void;
  }
  
  const BillModal: React.FC<BillModalProps>;
  export default BillModal;
} 